"""
Real transcript generation for the AI Week video-chat demo.

Optional upgrade path: the 4 transcripts under transcripts/*.json are currently
synthetic placeholders (see the "synthetic": true / "note" fields in each file),
hand-written from the sessions' real titles/descriptions so the demo works today
without needing audio downloads. Run this script to replace them with real,
Whisper-transcribed transcripts once you have ffmpeg installed and an
OPENAI_API_KEY available.

Requires: ffmpeg on PATH, `pip install -r requirements.txt`, OPENAI_API_KEY in .env.

Usage:
    python generate_transcripts.py                 # regenerate all 4
    python generate_transcripts.py 3458860 3424768  # regenerate just these
"""

import json
import os
import subprocess
import sys
import tempfile

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

TRANSCRIPTS_DIR = os.path.join(os.path.dirname(__file__), 'transcripts')

# Same 5 sessions used by the demo (from event-libs' own
# mock-chimera-response-new.json), so regenerated transcripts line up with the
# video IDs the front-end already renders cards for.
VIDEOS = [
    {'videoId': '3458860', 'service': 'adobeTv', 'title': 'What They Never Taught You: Real Talk about Your Creative Career'},
    {'videoId': '3458952', 'service': 'adobeTv', 'title': 'Design Powerhouse Super Session: Maximizing Your Creativity'},
    {'videoId': '5-bUvwi2L-E', 'service': 'youtube', 'title': 'The Heart and Mind of Editing Award-Winning Music Videos'},
    {'videoId': '3424767', 'service': 'adobeTv', 'title': 'Sunshine and Storms: Weathering a Creative Life'},
    {'videoId': '3424768', 'service': 'adobeTv', 'title': 'Super Session: Future-Proofing Your Design Career in the Age of AI'},
]

CHUNK_SECONDS = 20 * 60  # keeps each audio chunk comfortably under the Whisper API's 25MB limit


def extract_atv_mp4_url(video_page_url):
    """Adapted from vcx's video/adobetv.py - scrapes the player's embedded JSON for the source mp4."""
    response = requests.get(video_page_url, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.content, 'html.parser')
    script_text = soup.find_all('script')[2].get_text()

    start_marker = '//bridge\nvar bridge ='
    end_marker = ';\n//!bridge'
    start = script_text.index(start_marker) + len(start_marker)
    end = script_text.index(end_marker)
    bridge = json.loads(script_text[start:end])

    for source in bridge['sources']:
        if source['format'] == 'mpeg4':
            return source['src']
    raise RuntimeError(f'No mpeg4 source found for {video_page_url}')


def download_adobetv_audio(video_id, workdir):
    page_url = f'https://video.tv.adobe.com/v/{video_id}'
    mp4_url = extract_atv_mp4_url(page_url)
    mp4_path = os.path.join(workdir, f'{video_id}.mp4')

    with requests.get(mp4_url, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        with open(mp4_path, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    return mp4_path


def download_youtube_audio(video_id, workdir):
    url = f'https://www.youtube.com/watch?v={video_id}'
    out_template = os.path.join(workdir, f'{video_id}.%(ext)s')
    # yt-dlp instead of vcx's pytube - pytube breaks on YouTube's frequent
    # player-signature changes; yt-dlp is actively maintained against them.
    subprocess.run(
        ['yt-dlp', '-x', '--audio-format', 'mp3', '-o', out_template, url],
        check=True,
    )
    return os.path.join(workdir, f'{video_id}.mp3')


def to_mp3(input_path, workdir, video_id):
    mp3_path = os.path.join(workdir, f'{video_id}-audio.mp3')
    if input_path.endswith('.mp3'):
        return input_path
    # subprocess.run with an argument list (not os.system/shell=True) - avoids
    # shell-injection risk from interpolating file paths into a shell string.
    subprocess.run(
        ['ffmpeg', '-y', '-i', input_path, '-vn', '-ar', '16000', '-ac', '1', mp3_path],
        check=True,
        capture_output=True,
    )
    return mp3_path


def chunk_audio(mp3_path, workdir, video_id):
    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
         '-of', 'default=noprint_wrappers=1:nokey=1', mp3_path],
        check=True, capture_output=True, text=True,
    )
    duration = float(probe.stdout.strip())

    chunks = []
    start = 0.0
    index = 0
    while start < duration:
        chunk_path = os.path.join(workdir, f'{video_id}-chunk-{index}.mp3')
        subprocess.run(
            ['ffmpeg', '-y', '-ss', str(start), '-t', str(CHUNK_SECONDS),
             '-i', mp3_path, '-c', 'copy', chunk_path],
            check=True, capture_output=True,
        )
        chunks.append({'path': chunk_path, 'offset': start})
        start += CHUNK_SECONDS
        index += 1
    return chunks


def transcribe_chunks(client, chunks):
    segments = []
    for chunk in chunks:
        with open(chunk['path'], 'rb') as audio_file:
            result = client.audio.transcriptions.create(
                model='whisper-1',
                file=audio_file,
                response_format='verbose_json',
            )
        for seg in result.segments:
            segments.append({
                'start': round(chunk['offset'] + seg['start']),
                'text': seg['text'].strip(),
            })
    return segments


def generate(video, client):
    print(f"--- Generating transcript for {video['videoId']} ({video['title']}) ---")
    with tempfile.TemporaryDirectory() as workdir:
        if video['service'] == 'adobeTv':
            downloaded = download_adobetv_audio(video['videoId'], workdir)
        elif video['service'] == 'youtube':
            downloaded = download_youtube_audio(video['videoId'], workdir)
        else:
            raise ValueError(f"Unknown service: {video['service']}")

        mp3_path = to_mp3(downloaded, workdir, video['videoId'])
        chunks = chunk_audio(mp3_path, workdir, video['videoId'])
        segments = transcribe_chunks(client, chunks)

    output = {
        'videoId': video['videoId'],
        'title': video['title'],
        'durationSeconds': segments[-1]['start'] if segments else 0,
        'synthetic': False,
        'segments': segments,
    }
    out_path = os.path.join(TRANSCRIPTS_DIR, f"{video['videoId']}.json")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)
    print(f'Wrote {out_path} ({len(segments)} segments)')


def main():
    if not os.environ.get('OPENAI_API_KEY'):
        print('OPENAI_API_KEY is required (set it in .env). Aborting.', file=sys.stderr)
        sys.exit(1)

    requested = set(sys.argv[1:])
    videos = [v for v in VIDEOS if not requested or v['videoId'] in requested]
    if not videos:
        print('No matching video IDs.', file=sys.stderr)
        sys.exit(1)

    client = OpenAI()
    for video in videos:
        try:
            generate(video, client)
        except Exception as err:  # noqa: BLE001 - top-level CLI, report and continue with the rest
            print(f"Failed to generate transcript for {video['videoId']}: {err}", file=sys.stderr)


if __name__ == '__main__':
    main()
