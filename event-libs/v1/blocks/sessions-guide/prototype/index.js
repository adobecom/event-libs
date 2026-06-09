

    // Populate all session cards with content
    const cardHTML = `
      <div class="session-card-body">
        <p class="session-card-title">Pixel &amp; Product: Scalable Visual Systems for Modern Brands</p>
        <p class="session-card-desc">Whether you're looking to boost your creativity, uncover new techniques, or supercharge your workflow</p>
        <div class="session-card-footer">
          <span class="session-tag tag-in-body">Business</span>
          <span class="session-card-time">9:15AM – 9:45AM</span>
        </div>
      </div>
      <div class="card-icon-actions">
        <button class="card-icon-btn" data-action="schedule" aria-label="Add to schedule"><span class="icon-calendar-sm"></span></button>
        <button class="card-icon-btn" data-action="favorite" aria-label="Favorite"><span class="icon-heart-sm"></span></button>
      </div>
    `;
    // Seeded PRNG (mulberry32) — fixed seed so randomization is stable across reloads
    function mulberry32(seed) {
      return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rand = mulberry32(42);

    // Randomize card count per row (1–4), then populate — skip past section rows (fixed 3 cards)
    document.querySelectorAll('.sessions-section:not(.past-sessions-section) .session-cards-row').forEach(row => {
      const count = Math.floor(rand() * 4) + 1;
      const current = row.querySelectorAll('.session-card').length;
      if (count > current) {
        for (let i = 0; i < count - current; i++) {
          const card = document.createElement('div');
          card.className = 'session-card';
          row.appendChild(card);
        }
      } else {
        const cards = row.querySelectorAll('.session-card');
        for (let i = count; i < current; i++) cards[i].remove();
      }
    });

    document.querySelectorAll('.session-card').forEach(card => {
      card.innerHTML = cardHTML;
    });

    // Assign unique session IDs (stable — set once after population)
    let sidCounter = 0;
    document.querySelectorAll('.session-card').forEach(card => { card.dataset.sid = ++sidCounter; });
    document.querySelectorAll('.live-card').forEach(card => { card.dataset.sid = ++sidCounter; });

    // Randomize session tags — Mainstage weighted lower (1x) vs others (4x)
    const tagPool = [
      'Generative AI','Generative AI','Generative AI','Generative AI',
      'Business','Business','Business','Business',
      '3D','3D','3D','3D',
      'Branding','Branding','Branding','Branding',
      'Education','Education','Education','Education',
      'Social media','Social media','Social media','Social media',
      'Photography','Photography','Photography','Photography',
      'Video','Video','Video','Video',
      'Design & Illustration','Design & Illustration','Design & Illustration','Design & Illustration',
      'Content Creator','Content Creator','Content Creator','Content Creator',
      'Mainstage'
    ];
    // Channel icon glyphs (Spectrum 2 icons inlined from Figma design 9242:123548)
    const channelIcons = {
      'design':      { vb: '0 0 20 20', paths: `<path d="M13.2402 3.7168L11.2832 1.75977C10.6045 1.08106 9.49902 1.08301 8.82031 1.75977L7.49804 3.08301C7.47973 3.10132 7.47265 3.12549 7.45654 3.14527L4.48828 4.76368C4.05566 5.00098 3.7207 5.38575 3.54492 5.84669L1.35254 11.6094C1.13281 12.1865 1.27344 12.8428 1.70996 13.2793C2.01172 13.5811 2.41211 13.7402 2.82129 13.7402C3.01856 13.7402 3.21777 13.7031 3.4082 13.627L9.52246 11.168C9.99316 10.9795 10.3769 10.624 10.6025 10.1719L11.9673 7.44436C11.9749 7.43728 11.9849 7.43508 11.9922 7.42776L13.2412 6.17874C13.9189 5.50003 13.9189 4.39453 13.2402 3.7168ZM9.25976 9.50196C9.19824 9.62696 9.09277 9.72364 8.96288 9.7754L4.24755 11.6715L6.47607 9.443C6.89624 9.40418 7.229 9.0619 7.229 8.63135C7.229 8.17505 6.85913 7.80506 6.40283 7.80506C5.97241 7.80506 5.62988 8.13795 5.59131 8.55823L3.21436 10.9352L4.94727 6.37988C4.9961 6.25195 5.08887 6.1455 5.20801 6.08008L7.92188 4.59961L10.4482 7.12695L9.25976 9.50196ZM12.1797 5.11915L11.3711 5.92774L9.07251 3.62916L9.87988 2.8213C9.97656 2.72462 10.1299 2.72755 10.2226 2.82032L12.1797 4.77735C12.2734 4.8711 12.2734 5.0254 12.1797 5.11915Z"/><path d="M18.0811 6.65137C17.6475 6.28809 17.1045 6.11426 16.5322 6.16602C15.9678 6.2168 15.456 6.4834 15.084 6.92969C15.0283 6.99951 11.9702 10.7666 10.7192 12.27C10.4756 12.2877 10.2295 12.3253 9.98339 12.3936C8.41601 12.8281 7.8623 14.1367 7.37401 15.29C7.01073 16.1465 6.66893 16.9551 5.95506 17.3418C5.66893 17.4961 5.51561 17.8184 5.57518 18.1387C5.63475 18.458 5.89354 18.7031 6.21678 18.7451C6.92381 18.836 7.70994 18.9024 8.50389 18.9024C10.1631 18.9024 11.8555 18.6133 12.9238 17.6602C13.6601 17.0029 14.0254 16.1211 14.0107 15.0371C14.0102 15.0104 14.0014 14.9854 14.0005 14.9587C14.9604 13.8037 17.0359 11.2521 17.9336 10.1494L18.3486 9.63868C18.7119 9.20411 18.8847 8.6543 18.834 8.08985C18.7832 7.5254 18.5166 7.01368 18.0811 6.65137ZM11.9248 16.541C11.2256 17.1631 9.83496 17.459 8.00292 17.3926C8.31835 16.9053 8.54394 16.374 8.75487 15.875C9.22655 14.7617 9.5576 14.0684 10.3838 13.8389C10.9844 13.6729 11.5664 13.7598 11.9873 14.0732C12.3144 14.3193 12.5059 14.6777 12.5107 15.0586C12.5195 15.6963 12.3281 16.1816 11.9248 16.541ZM17.2041 8.66993C17.1953 8.68067 17.0322 8.88087 16.7695 9.20313C16.019 10.1257 14.439 12.0671 13.3828 13.3521C13.2383 13.177 13.0752 13.0143 12.8867 12.8731C12.7353 12.7598 12.5671 12.6763 12.3987 12.5936C13.8393 10.8447 16.2341 7.8932 16.2441 7.87989C16.3506 7.75294 16.5 7.67481 16.666 7.66016C16.8203 7.64258 16.9912 7.69629 17.1201 7.80176C17.2471 7.90821 17.3252 8.05762 17.3398 8.22364C17.3545 8.38868 17.3047 8.54981 17.2041 8.66993Z"/>` },
      'video':       { vb: '0 0 20 20', paths: `<path d="M15.75 18H4.25C3.00977 18 2 16.9902 2 15.75V4.25C2 3.00977 3.00977 2 4.25 2H15.75C16.9902 2 18 3.00977 18 4.25V15.75C18 16.9902 16.9902 18 15.75 18ZM4.25 3.5C3.83691 3.5 3.5 3.83691 3.5 4.25V15.75C3.5 16.1631 3.83691 16.5 4.25 16.5H15.75C16.1631 16.5 16.5 16.1631 16.5 15.75V4.25C16.5 3.83691 16.1631 3.5 15.75 3.5H4.25Z"/><path d="M13.0731 9.11916L8.47336 6.64704C7.80715 6.28898 6.99994 6.77155 6.99994 7.52789V12.4721C6.99994 13.2285 7.80715 13.711 8.47336 13.353L13.0731 10.8808C13.7752 10.5035 13.7752 9.49652 13.0731 9.11916Z"/>` },
      'branding':    { vb: '0 0 20 20', paths: `<path d="M10.0068 19C9.92286 19 9.83887 18.998 9.75391 18.9961C5.33203 18.7451 1.93555 15.0938 2.00098 10.6846V3.25C2.00098 2.00977 3.01075 1 4.25098 1H15.75C16.9902 1 18 2.00977 18 3.25L17.9971 11.2402C17.9307 13.3799 17.0381 15.3633 15.4814 16.8271C13.9854 18.2334 12.0498 19 10.0068 19ZM4.25098 2.5C3.83789 2.5 3.50098 2.83691 3.50098 3.25V10.6953C3.44727 14.3096 6.22266 17.293 9.82032 17.4971C11.5273 17.5488 13.1885 16.9238 14.4531 15.7344C15.7178 14.5449 16.4443 12.9336 16.4971 11.1973L16.5 11V3.25C16.5 2.83691 16.1631 2.5 15.75 2.5H4.25098Z"/><path d="M14.25 12H8.75C8.48535 12 8.24023 11.8603 8.10547 11.6328C7.96973 11.4053 7.96485 11.123 8.0918 10.8906L10.8428 5.85156C10.9746 5.61035 11.2266 5.46094 11.501 5.46094C11.7754 5.46094 12.0283 5.61133 12.1592 5.85156L14.9082 10.8906C15.0351 11.123 15.0303 11.4053 14.8945 11.6328C14.7598 11.8603 14.5146 12 14.25 12ZM10.0137 10.5H12.9863L11.501 7.77637L10.0137 10.5Z"/><path d="M5.74902 12C5.62793 12 5.50488 11.9707 5.39062 11.9082C5.02734 11.71 4.89355 11.2539 5.09179 10.8906L7.07324 7.26171C7.27051 6.89843 7.72656 6.76366 8.09082 6.96288C8.4541 7.16112 8.58789 7.61718 8.38965 7.98046L6.4082 11.6094C6.27246 11.8584 6.01465 12 5.74902 12Z"/>` },
      'content':     { vb: '0 0 20 20', paths: `<path d="M18.571 10.0428C17.6051 9.2513 16.1178 9.35432 15.192 10.2821L11.0094 14.4647C10.7614 14.7123 10.5768 15.0204 10.4762 15.3553L9.52214 18.515C9.44206 18.7797 9.51433 19.0668 9.70964 19.2621C9.85222 19.4047 10.0436 19.4818 10.2399 19.4818C10.3122 19.4818 10.3854 19.4716 10.4567 19.4496L13.6149 18.496C13.9508 18.3949 14.2594 18.2108 14.5055 17.9633C14.5055 17.9633 18.6305 13.8387 18.7584 13.7103C19.2516 13.2176 19.5153 12.535 19.4801 11.8383C19.4459 11.1415 19.1139 10.4872 18.571 10.0428ZM11.362 17.6092L11.9128 15.788C11.9298 15.7306 11.9706 15.6861 12.0031 15.6363L13.3354 16.9685C13.2853 17.0013 13.2406 17.0422 13.1823 17.0599L11.362 17.6092ZM17.6969 12.6507C17.6042 12.744 15.4457 14.9022 14.2411 16.1066L12.8647 14.7306L16.2526 11.3426C16.4743 11.121 16.7653 11.0057 17.0456 11.0057C17.2555 11.0057 17.4587 11.0707 17.6217 11.204C17.8405 11.3827 17.9684 11.6346 17.9821 11.9125C17.9958 12.1908 17.8952 12.4525 17.6969 12.6507Z"/><path d="M8.99983 11.2497C6.38069 11.2497 4.24983 9.00651 4.24983 6.24967C4.24983 3.49283 6.38069 1.24967 8.99983 1.24967C11.619 1.24967 13.7498 3.49283 13.7498 6.24967C13.7498 9.00651 11.619 11.2497 8.99983 11.2497ZM8.99983 2.74967C7.20784 2.74967 5.74983 4.31998 5.74983 6.24967C5.74983 8.17936 7.20784 9.74967 8.99983 9.74967C10.7918 9.74967 12.2498 8.17936 12.2498 6.24967C12.2498 4.31998 10.7918 2.74967 8.99983 2.74967Z"/><path d="M1.75081 18.7497C1.72688 18.7497 1.70247 18.7487 1.67806 18.7458C1.26546 18.7067 0.9637 18.3405 1.00326 17.9274C1.3099 14.7438 4.8226 12.2497 8.99984 12.2497C9.24789 12.2497 9.493 12.2585 9.73422 12.2751C10.1473 12.3034 10.4588 12.6618 10.43 13.0749C10.4012 13.4879 10.0487 13.7858 9.62973 13.7711C9.4227 13.7565 9.21274 13.7497 8.99985 13.7497C5.58676 13.7497 2.72983 15.6481 2.49643 18.0719C2.45883 18.4596 2.13265 18.7497 1.75081 18.7497Z"/>` },
      'photography': { vb: '0 0 20 20', paths: `<path d="M16.75 17H3.25C2.00928 17 1 15.9902 1 14.75V7.25C1 6.00977 2.00928 5 3.25 5H5.07275C5.35888 5 5.61572 4.84082 5.74365 4.58594L5.91455 4.24414C6.29834 3.47656 7.06934 3 7.92725 3H12.0728C12.9307 3 13.7017 3.47656 14.0855 4.24414L14.2564 4.58594C14.3843 4.84082 14.6411 5 14.9273 5H16.75C17.9907 5 19 6.00977 19 7.25V14.75C19 15.9902 17.9907 17 16.75 17ZM3.25 6.5C2.83643 6.5 2.5 6.83691 2.5 7.25V14.75C2.5 15.1631 2.83643 15.5 3.25 15.5H16.75C17.1636 15.5 17.5 15.1631 17.5 14.75V7.25C17.5 6.83691 17.1636 6.5 16.75 6.5H14.9272C14.0693 6.5 13.2983 6.02344 12.9145 5.25586L12.7437 4.91406C12.6157 4.65918 12.3589 4.5 12.0728 4.5H7.92724C7.64111 4.5 7.38427 4.65918 7.25634 4.91406L7.08544 5.25586C6.70165 6.02344 5.93065 6.5 5.07274 6.5H3.25Z"/><path d="M10 14.5C7.79443 14.5 6 12.706 6 10.5C6 8.29395 7.79443 6.5 10 6.5C12.2056 6.5 14 8.29395 14 10.5C14 12.706 12.2056 14.5 10 14.5ZM10 8C8.62158 8 7.5 9.12109 7.5 10.5C7.5 11.8789 8.62158 13 10 13C11.3784 13 12.5 11.8789 12.5 10.5C12.5 9.12109 11.3784 8 10 8Z"/>` },
      'education':   { vb: '0 0 20 20', paths: `<path d="M10 2.24121C9.58594 2.24121 9.25 1.90527 9.25 1.49121V0.79101C9.25 0.37695 9.58594 0.04101 10 0.04101C10.4141 0.04101 10.75 0.37695 10.75 0.79101V1.49121C10.75 1.90527 10.4141 2.24121 10 2.24121Z"/><path d="M18.4541 10.0215H17.7539C17.3398 10.0215 17.0039 9.68554 17.0039 9.27148C17.0039 8.85742 17.3398 8.52148 17.7539 8.52148H18.4541C18.8682 8.52148 19.2041 8.85742 19.2041 9.27148C19.2041 9.68554 18.8682 10.0215 18.4541 10.0215Z"/><path d="M2.23242 10.0215H1.53222C1.11816 10.0215 0.78222 9.68554 0.78222 9.27148C0.78222 8.85742 1.11816 8.52148 1.53222 8.52148H2.23242C2.64648 8.52148 2.98242 8.85742 2.98242 9.27148C2.98242 9.68554 2.64648 10.0215 2.23242 10.0215Z"/><path d="M4.51074 4.53906C4.31836 4.53906 4.12695 4.46582 3.98047 4.31933L3.48535 3.82421C3.19238 3.53124 3.19238 3.05663 3.48535 2.76366C3.77832 2.47069 4.25293 2.47069 4.5459 2.76366L5.04102 3.25878C5.33399 3.55175 5.33399 4.02636 5.04102 4.31933C4.89454 4.46581 4.70312 4.53906 4.51074 4.53906Z"/><path d="M15.4756 4.53906C15.2832 4.53906 15.0918 4.46582 14.9453 4.31933C14.6524 4.02636 14.6524 3.55175 14.9453 3.25878L15.4404 2.76366C15.7334 2.47069 16.208 2.47069 16.501 2.76366C16.794 3.05663 16.794 3.53124 16.501 3.82421L16.0059 4.31933C15.8594 4.46581 15.668 4.53906 15.4756 4.53906Z"/><path d="M16 9.5C16 6.19141 13.3086 3.5 10 3.5C6.69141 3.5 4 6.19141 4 9.5C4 11.7157 5.21021 13.6499 7.00122 14.689C7.00122 14.6913 7 14.6931 7 14.6953V16.5C7 18.1543 8.3457 19.5 10 19.5C11.6543 19.5 13 18.1543 13 16.5V14.6882C14.7904 13.6489 16 11.7151 16 9.5ZM11.5 16.5C11.5 17.3271 10.8271 18 10 18C9.17285 18 8.5 17.3271 8.5 16.5V15.3025C8.98047 15.4269 9.4812 15.5 10 15.5C10.5188 15.5 11.0195 15.4269 11.5 15.3025V16.5ZM10 14C7.51855 14 5.5 11.9815 5.5 9.5C5.5 7.01855 7.51855 5 10 5C12.4815 5 14.5 7.01855 14.5 9.5C14.5 11.9815 12.4815 14 10 14Z"/>` },
      'business':    { vb: '0 0 20 20', paths: `<path d="M14.9727 5.05371H13.4727V3.31445C13.4727 2.8955 13.0771 2.5 12.6582 2.5H7.18751C6.78907 2.5 6.50001 2.81543 6.50001 3.25V4.99023H5.00001V3.25C5.00001 1.98828 5.96095 1 7.18751 1H12.6582C13.8916 1 14.9727 2.08105 14.9727 3.31445V5.05371Z"/><path d="M16.75 17H3.25C2.00977 17 1 15.9902 1 14.75V6.25C1 5.00977 2.00977 4 3.25 4H16.75C17.9902 4 19 5.00977 19 6.25V14.75C19 15.9902 17.9902 17 16.75 17ZM3.25 5.5C2.83691 5.5 2.5 5.83691 2.5 6.25V14.75C2.5 15.1631 2.83691 15.5 3.25 15.5H16.75C17.1631 15.5 17.5 15.1631 17.5 14.75V6.25C17.5 5.83691 17.1631 5.5 16.75 5.5H3.25Z"/><path d="M18 9.25H2V10.75H18V9.25Z"/><path d="M5.75 12.25C5.33594 12.25 5 11.9141 5 11.5V9C5 8.58594 5.33594 8.25 5.75 8.25C6.16406 8.25 6.5 8.58594 6.5 9V11.5C6.5 11.9141 6.16406 12.25 5.75 12.25Z"/><path d="M14.25 12.25C13.8359 12.25 13.5 11.9141 13.5 11.5V9C13.5 8.58594 13.8359 8.25 14.25 8.25C14.6641 8.25 15 8.58594 15 9V11.5C15 11.9141 14.6641 12.25 14.25 12.25Z"/>` },
      '3d':          { vb: '0 0 20 20', paths: `<path d="M16.876 4.84082L11.126 1.52148C10.4297 1.11914 9.56739 1.12011 8.875 1.52148L3.12402 4.84082C2.43066 5.24219 2 5.98926 2 6.79004V13.4297C2 14.2315 2.43164 14.9775 3.125 15.3779L8.87402 18.6982C9.22168 18.8994 9.61132 18.999 10 18.999C10.3896 18.999 10.7783 18.8994 11.125 18.6982L16.875 15.3779C17.5684 14.9775 18 14.2315 18 13.4297V6.79004C18 5.98926 17.5693 5.24219 16.876 4.84082ZM9.62598 2.82031C9.74121 2.75293 9.87012 2.71972 10 2.71972C10.1289 2.71972 10.2588 2.75292 10.375 2.82031L15.6602 5.87182L10.0007 8.99413L4.33643 5.87328L9.62598 2.82031ZM3.875 14.0791C3.64355 13.9453 3.5 13.6963 3.5 13.4297V7.12598L9.25 10.2939V17.1829L3.875 14.0791ZM16.125 14.0791L10.75 17.1824V10.293L16.5 7.12061V13.4297C16.5 13.6963 16.3565 13.9453 16.125 14.0791Z"/>` },
      'social':      { vb: '0 0 20 20', paths: `<path opacity="0.6" d="M17.9554 8.12915C17.9829 7.90649 17.8962 7.68188 17.71 7.54639L10.3672 2.21289C10.338 2.19165 10.3047 2.18066 10.2731 2.16504C10.2524 2.15442 10.2338 2.14233 10.2119 2.13403C10.16 2.11523 10.1067 2.10644 10.0525 2.10193C10.031 2.09961 10.0122 2.08936 9.99023 2.08936C9.9436 2.08936 9.90136 2.10633 9.85766 2.11622C9.83898 2.12061 9.82006 2.12135 9.80175 2.12745C9.74462 2.14588 9.69482 2.17347 9.64623 2.20655C9.64208 2.20948 9.63695 2.21033 9.6328 2.21339L9.58739 2.24635C9.57421 2.25782 9.5576 2.26442 9.5454 2.27687L2.29102 7.54883C2.26685 7.56629 2.25061 7.59009 2.22974 7.61023C2.20984 7.62927 2.18958 7.646 2.17237 7.66773C2.12623 7.72559 2.08839 7.78882 2.06544 7.85804C2.06495 7.85938 2.06398 7.86012 2.06349 7.86134C2.063 7.86305 2.06349 7.86464 2.063 7.86622C2.04103 7.93592 2.03468 8.00916 2.03798 8.08326C2.0392 8.10914 2.04518 8.13282 2.04958 8.15821C2.05471 8.188 2.05397 8.21802 2.0635 8.24757L4.86916 16.8784C4.87893 16.9085 4.89748 16.933 4.9114 16.9607C4.92239 16.9827 4.93093 17.0045 4.9446 17.0254C4.98635 17.0889 5.03542 17.1461 5.09597 17.1902L5.0967 17.1909C5.10549 17.1973 5.11574 17.1993 5.12478 17.2052C5.17043 17.2349 5.21804 17.262 5.27041 17.2791C5.33328 17.2996 5.39822 17.3101 5.46291 17.3101L14.5391 17.3091C14.5681 17.3091 14.5947 17.2996 14.6229 17.2957C14.6508 17.2919 14.6775 17.2902 14.7049 17.2825C14.8507 17.2421 14.9751 17.1511 15.0584 17.0243C15.0722 17.0032 15.0808 16.981 15.0919 16.9586C15.1057 16.9312 15.124 16.9068 15.1338 16.877L17.9375 8.24512C17.9473 8.21485 17.9467 8.18408 17.9517 8.15332C17.9527 8.14502 17.9548 8.13745 17.9554 8.12915ZM14.3237 15.3243L11.0142 10.77L16.3613 9.05139L14.3237 15.3243ZM3.63135 9.02734L8.98975 10.7676L5.67908 15.3252L3.63135 9.02734ZM10.6169 3.93933L16.0048 7.85254L10.625 9.58203L10.6169 3.93933ZM9.37476 9.57861L4.0177 7.83862L9.36694 3.95117L9.37476 9.57861ZM10.001 11.5024L13.3123 16.0592L6.69043 16.0599L10.001 11.5024Z"/><path d="M9.9972 4.10342C10.8255 4.10342 11.4969 3.43199 11.4969 2.60374C11.4969 1.77549 10.8255 1.10406 9.9972 1.10406C9.16895 1.10406 8.49752 1.77549 8.49752 2.60374C8.49752 3.43199 9.16895 4.10342 9.9972 4.10342Z"/><path d="M5.41642 18.2449C6.24467 18.2449 6.9161 17.5734 6.9161 16.7452C6.9161 15.9169 6.24467 15.2455 5.41642 15.2455C4.58817 15.2455 3.91674 15.9169 3.91674 16.7452C3.91674 17.5734 4.58817 18.2449 5.41642 18.2449Z"/><path d="M10 11.8485C10.8283 11.8485 11.4997 11.1771 11.4997 10.3489C11.4997 9.52062 10.8283 8.84919 10 8.84919C9.17175 8.84919 8.50032 9.52062 8.50032 10.3489C8.50032 11.1771 9.17175 11.8485 10 11.8485Z"/><path d="M14.5575 18.2102C15.3857 18.2102 16.0572 17.5387 16.0572 16.7105C16.0572 15.8822 15.3857 15.2108 14.5575 15.2108C13.7292 15.2108 13.0578 15.8822 13.0578 16.7105C13.0578 17.5387 13.7292 18.2102 14.5575 18.2102Z"/><path d="M17.4001 9.58791C18.2283 9.58791 18.8998 8.91648 18.8998 8.08823C18.8998 7.25998 18.2283 6.58855 17.4001 6.58855C16.5718 6.58855 15.9004 7.25998 15.9004 8.08823C15.9004 8.91648 16.5718 9.58791 17.4001 9.58791Z"/><path d="M2.59991 9.58037C3.42816 9.58037 4.09959 8.90894 4.09959 8.08069C4.09959 7.25244 3.42816 6.58101 2.59991 6.58101C1.77166 6.58101 1.10023 7.25244 1.10023 8.08069C1.10023 8.90894 1.77166 9.58037 2.59991 9.58037Z"/>` },
      'mainstage':   { vb: '0 0 14 13', paths: `<path d="M0 12.1367L5.19492 0H8.84061L14 12.1437H10.134L6.87919 4.07806L4.73299 9.36701H7.28426L8.30051 12.1367H0Z"/>` },
      'generative':  { vb: '0 0 20 20', paths: `<path d="M13.25 18H5.75C3.68213 18 2 16.3174 2 14.25V6.75C2 4.68262 3.68213 3 5.75 3H8C8.41406 3 8.75 3.33594 8.75 3.75C8.75 4.16406 8.41406 4.5 8 4.5H5.75C4.50928 4.5 3.5 5.50977 3.5 6.75V14.25C3.5 15.4902 4.50928 16.5 5.75 16.5H13.25C14.4907 16.5 15.5 15.4902 15.5 14.25V10.498C15.5 10.084 15.8359 9.74805 16.25 9.74805C16.6641 9.74805 17 10.084 17 10.498V14.25C17 16.3174 15.3179 18 13.25 18Z"/><path d="M12.9366 9.58213C12.7423 9.58213 12.5465 9.53135 12.3687 9.42881C11.9405 9.18174 11.7227 8.69151 11.8272 8.20811L12.3399 5.83311L10.7086 4.03331C10.3765 3.6671 10.3194 3.13292 10.567 2.70421C10.815 2.27648 11.3043 2.0587 11.7891 2.16319L14.1632 2.67686L15.9625 1.04502C16.3292 0.712011 16.8639 0.655371 17.2921 0.903421C17.7203 1.15049 17.9376 1.6417 17.8326 2.1251L17.3199 4.49912L18.9513 6.29892C19.2833 6.66513 19.3409 7.19833 19.0933 7.62704C18.8463 8.05673 18.358 8.2745 17.8712 8.16903L15.4972 7.65536L13.6978 9.2872C13.483 9.48154 13.211 9.58213 12.9366 9.58213ZM13.8458 5.96592L13.5338 7.41123L14.629 6.41807C14.9009 6.17198 15.2735 6.06944 15.6314 6.15049L17.0743 6.46201L16.0821 5.36728C15.8375 5.09677 15.7374 4.72373 15.8135 4.36728L16.126 2.92197L15.0313 3.91416C14.7598 4.15928 14.3887 4.26279 14.0284 4.18174L12.5855 3.87022L13.5777 4.96495C13.8228 5.23448 13.9234 5.60947 13.8458 5.96592Z"/><path d="M8.1201 13.2532C7.99119 13.2532 7.8618 13.22 7.7451 13.1526C7.46287 12.9895 7.31834 12.6634 7.38719 12.345L7.58983 11.4056L6.94432 10.6936C6.72557 10.4515 6.68748 10.097 6.85057 9.81474C7.01366 9.53251 7.34276 9.39286 7.65868 9.45634L8.59764 9.66044L9.30955 9.01493C9.55125 8.7952 9.90672 8.75809 10.1885 8.92118C10.4707 9.08427 10.6152 9.41044 10.5464 9.7288L10.3437 10.6682L10.9892 11.3802C11.208 11.6223 11.2461 11.9768 11.083 12.2591C10.9199 12.5413 10.5918 12.68 10.2749 12.6175L9.33543 12.4134L8.624 13.0589C8.4824 13.1868 8.30174 13.2532 8.1201 13.2532Z"/>` },
    };

    // Map a tag label to a data-cat key (drives the icon shown before the label)
    function tagToCat(tag) {
      const t = tag.toLowerCase();
      if (t.includes('business'))      return 'business';
      if (t.includes('3d'))            return '3d';
      if (t.includes('design'))        return 'design';
      if (t.includes('photo'))         return 'photography';
      if (t.includes('social'))        return 'social';
      if (t.includes('video'))         return 'video';
      if (t.includes('generative'))    return 'generative';
      if (t.includes('mainstage'))     return 'mainstage';
      if (t.includes('branding'))      return 'branding';
      if (t.includes('education'))     return 'education';
      if (t.includes('content'))       return 'content';
      return '';
    }

    // Build the inner HTML of a session tag: icon + label
    function renderTagContent(text, cat) {
      const icon = cat && channelIcons[cat]
        ? `<svg class="session-tag-icon" viewBox="${channelIcons[cat].vb}" fill="currentColor" aria-hidden="true">${channelIcons[cat].paths}</svg>`
        : '';
      const safeText = String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `${icon}<span class="session-tag-text">${safeText}</span>`;
    }

    // Update a tag element's content (text + icon) based on the label string
    function setTagContent(el, text) {
      const cat = tagToCat(text || '');
      el.innerHTML = renderTagContent(text || '', cat);
      if (cat) el.setAttribute('data-cat', cat);
      else el.removeAttribute('data-cat');
    }

    document.querySelectorAll('.sessions-section:not(.past-sessions-section) .session-card').forEach(card => {
      const t = tagPool[Math.floor(rand() * tagPool.length)];
      card.querySelectorAll('.session-tag').forEach(el => {
        setTagContent(el, t);
      });
    });

    // Inject icons into live-badge elements
    document.querySelectorAll('.live-badge').forEach(el => {
      const text = el.textContent.trim();
      const cat = tagToCat(text);
      el.innerHTML = renderTagContent(text, cat);
      if (cat) el.setAttribute('data-cat', cat);
    });

    // Randomize session card times per row
    function parseTime(label) {
      // e.g. "9:15AM" or "12:00PM"
      const m = label.trim().match(/^(\d+):(\d+)(AM|PM)$/i);
      if (!m) return null;
      let h = parseInt(m[1]), min = parseInt(m[2]);
      const period = m[3].toUpperCase();
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return h * 60 + min;
    }
    function formatTime(totalMin) {
      let h = Math.floor(totalMin / 60) % 24;
      const min = totalMin % 60;
      const period = h < 12 ? 'AM' : 'PM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${String(min).padStart(2,'0')}${period}`;
    }
    // Weighted durations: 15min (40%), 30min (40%), 60min (20%)
    function randomDuration() {
      const r = rand();
      return r < 0.4 ? 15 : r < 0.8 ? 30 : 60;
    }
    // Parse "9:15AM – 9:45AM" → {start, end} in minutes
    function parseTimeRange(text) {
      if (!text || text === 'On-demand') return null;
      const parts = text.split('–').map(s => s.trim());
      if (parts.length < 2) return null;
      const start = parseTime(parts[0]);
      const end = parseTime(parts[1]);
      if (start === null || end === null) return null;
      return { start, end };
    }
    function getCardTimeRange(card) {
      if (!card) return null;
      const el = card.querySelector('.session-card-time') || card.querySelector('.live-time');
      return el ? parseTimeRange(el.textContent) : null;
    }
    function findConflict(candidateSid, candidateCard) {
      const range = getCardTimeRange(candidateCard);
      if (!range) return null;
      for (const sid of scheduled) {
        if (String(sid) === String(candidateSid)) continue;
        const sc = document.querySelector(`[data-sid="${sid}"]`);
        const sr = getCardTimeRange(sc);
        if (!sr) continue;
        if (range.start < sr.end && sr.start < range.end) return sc;
      }
      return null;
    }
    function hasScheduleConflict(candidateSid, candidateCard) {
      return findConflict(candidateSid, candidateCard) !== null;
    }

    // ── Conflict modal ────────────────────────────────────────────────
    const conflictModal = document.getElementById('conflictModal');
    const conflictOptions = document.getElementById('conflictOptions');
    const conflictSaveBtn = document.getElementById('conflictSaveBtn');
    const conflictModalClose = document.getElementById('conflictModalClose');
    let conflictPendingSid = null;
    let conflictExistingSid = null;
    let conflictSelectedSid = null;

    function getCardInfoForModal(card) {
      const title = card.querySelector('.session-card-title')?.textContent || '';
      const timeText = card.querySelector('.session-card-time')?.textContent || '';
      const tagEl = card.querySelector('.session-tag');
      const tagIconHtml = tagEl ? (tagEl.querySelector('[class*="icon-tag"]')?.outerHTML || '') : '';
      const tagText = card.querySelector('.session-tag-text')?.textContent || tagEl?.textContent?.trim() || '';
      return { title, timeText, tagIconHtml, tagText };
    }

    function renderConflictOption(sid, card, isCurrentlyScheduled, isSelected) {
      const { title, timeText, tagIconHtml, tagText } = getCardInfoForModal(card);
      return `
        <div class="conflict-option${isSelected ? ' selected' : ''}" data-sid="${sid}">
          <div class="conflict-option-radio"></div>
          <div class="conflict-option-body">
            ${isCurrentlyScheduled ? '<div class="conflict-option-badge">Currently scheduled</div>' : ''}
            <div class="conflict-option-title">${title}</div>
            <div class="conflict-option-meta">
              <span class="conflict-option-cat">${tagIconHtml}<span>${tagText}</span></span>
              <span class="conflict-option-time">${timeText}</span>
            </div>
          </div>
        </div>`;
    }

    function openConflictModal(newSid, newCard) {
      const existingCard = findConflict(newSid, newCard);
      if (!existingCard) return;
      conflictPendingSid = String(newSid);
      conflictExistingSid = String(existingCard.dataset.sid);
      conflictSelectedSid = conflictExistingSid; // default: keep existing
      conflictOptions.innerHTML =
        renderConflictOption(conflictExistingSid, existingCard, true, true) +
        renderConflictOption(conflictPendingSid, newCard, false, false);
      conflictModal.hidden = false;
    }

    function closeConflictModal() {
      conflictModal.hidden = true;
      conflictPendingSid = null;
      conflictExistingSid = null;
      conflictSelectedSid = null;
    }

    conflictOptions.addEventListener('click', e => {
      const option = e.target.closest('.conflict-option[data-sid]');
      if (!option) return;
      conflictSelectedSid = option.dataset.sid;
      conflictOptions.querySelectorAll('.conflict-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.sid === conflictSelectedSid);
      });
    });

    conflictSaveBtn.addEventListener('click', () => {
      if (!conflictSelectedSid || !conflictPendingSid || !conflictExistingSid) { closeConflictModal(); return; }

      function syncCardCal(sid, isScheduled) {
        const c = document.querySelector(`.session-card[data-sid="${sid}"]`);
        if (!c) return;
        c.classList.toggle('is-scheduled', isScheduled);
        c.querySelectorAll('.icon-calendar-sm').forEach(i => i.classList.toggle('scheduled', isScheduled));
      }

      if (conflictSelectedSid === conflictPendingSid) {
        // User chose the new session — remove existing, add pending
        scheduled.delete(conflictExistingSid);
        scheduled.add(conflictPendingSid);
        syncCardCal(conflictExistingSid, false);
        syncCardCal(conflictPendingSid, true);
        showToast('Schedule updated', 'check', 'success');
      } else {
        // User chose to keep the existing session — pending stays unscheduled
        syncCardCal(conflictPendingSid, false);
        showToast('Existing session kept');
      }

      if (currentView === 'my') applyView();
      closeConflictModal();
    });

    conflictModalClose.addEventListener('click', closeConflictModal);
    conflictModal.addEventListener('click', e => {
      if (e.target === conflictModal) closeConflictModal();
    });
    document.querySelectorAll('.sessions-section:not(.past-sessions-section) .session-row').forEach(row => {
      const timeLabel = row.querySelector('.session-time');
      if (!timeLabel) return;
      const startMin = parseTime(timeLabel.textContent);
      if (startMin === null) return;
      row.querySelectorAll('.session-card-time').forEach(el => {
        const dur = randomDuration();
        el.textContent = `${formatTime(startMin)} – ${formatTime(startMin + dur)}`;
      });
    });

    // Fix past section: apply track tag + "On-demand" (overwrites any randomized values)
    document.querySelectorAll('.past-row').forEach(row => {
      const track = row.dataset.track;
      row.querySelectorAll('.session-tag').forEach(tag => {
        setTagContent(tag, track);
      });
      row.querySelectorAll('.session-card-time').forEach(el => {
        const card = el.closest('.session-card');
        if (card && card.dataset.ipod === 'true') {
          el.textContent = 'Recording coming soon';
          el.classList.add('ipod-label');
          const desc = card.querySelector('.session-card-desc');
          if (desc && !desc.querySelector('.ipod-label')) {
            desc.innerHTML = '<em class="ipod-label">Recorded in-person.</em> ' + desc.textContent;
          }
        } else {
          el.textContent = 'On-demand';
        }
      });
    });

    // ── Real session data (MAX 2024 Online sessions) ───────────────
    const realSessions = {
      "Mainstage": [
        { title: "Opening Keynote", time: "9:00AM – 11:00AM" },
        { title: "Inspiration Keynote", time: "10:00AM – 11:30AM" },
        { title: "MAX Sneaks", time: "5:30PM – 7:00PM" },
        { title: "Movies, Myth, Metaphor: Art of Film and TV Title Sequences", time: "8:00AM – 9:00AM" },
        { title: "40 Years of Art and Design: Graffiti, Hip-Hop, and Fine Art", time: "5:15PM – 6:15PM" },
        { title: "A Manifesto for Collaboration", time: "1:00PM – 2:00PM" },
        { title: "Unseen to Unforgettable: The Power of Personal Branding", time: "3:15PM – 4:15PM" },
        { title: "Ideas to Images: A Creative Journey", time: "8:00AM – 9:00AM" },
        { title: "Aaron Draplin: Old Dog, New Tricks", time: "3:15PM – 4:15PM" },
        { title: "Creativity Super Session: Graphic Design", time: "1:30PM – 2:30PM" },
        { title: "Creativity Super Session: Motion Design for Graphic Designers", time: "1:00PM – 2:00PM" },
        { title: "Creativity Super Session: Video and AI", time: "3:30PM – 4:30PM" },
        { title: "Creativity Super Session: Human-Centered AI Strategies for Creative Leaders", time: "12:00AM – 1:00AM" }
      ],
      "3D": [
        { title: "Integrate 3D with Photoshop Using the Substance 3D Viewer Beta App", time: "1:00PM – 1:30PM" },
        { title: "Color, Materials, and Finish Design with Substance 3D", time: "2:30PM – 3:00PM" },
        { title: "3D Texturing Made Simple with Substance 3D", time: "1:30AM – 2:00AM" }
      ],
      "Business": [
        { title: "AI-Powered Innovation: Leaping Ahead and Staying There", time: "1:00PM – 1:30PM" },
        { title: "Creativity Unleashed: Your Favorite Adobe Apps Simplified", time: "2:00PM – 2:30PM" },
        { title: "Getting the Most Out of Creative Cloud", time: "2:30PM – 3:00PM" },
        { title: "Maximize Acrobat Efficiency with Generative AI", time: "3:00PM – 3:30PM" },
        { title: "Successfully Scaling Creativity in an AI Wonderland", time: "1:00PM – 1:30PM" },
        { title: "Wicked Creativity Unlocked: Adobe Firefly Tricks and Treats", time: "2:00PM – 2:30PM" },
        { title: "Sizzling Stats: How Texas Roadhouse Serves Up Creative ROI", time: "3:00PM – 3:30PM" },
        { title: "Creativity Reimagined: Connections in the era of AI", time: "12:00PM – 12:30PM" }
      ],
      "Education": [
        { title: "Enhancing Reading Visualization with Adobe Express & Gen AI", time: "12:30PM – 1:00PM" },
        { title: "Upskilling for Today's Job Market with Digital Credentials", time: "2:00PM – 2:30PM" },
        { title: "Art, Culture, Community: Student Journey with Adobe Express", time: "12:30PM – 1:00PM" }
      ],
      "Design & Illustration": [
        { title: "Finding Character Inspiration in Everyday Objects", time: "12:30PM – 1:00PM" },
        { title: "Turning Your Art Doodles and Lettering into Fun Patterns", time: "3:00PM – 3:30PM" },
        { title: "Putting My (Design) Cards on the Table", time: "4:30PM – 5:00PM" },
        { title: "Designing a Book Cover: Inspiration and Design Tricks", time: "12:00PM – 12:30PM" },
        { title: "Techniques to Maximize Automation and AI Tools in InDesign", time: "4:30PM – 5:00PM" },
        { title: "Powerhouse Design Trio: Photoshop + Illustrator + InDesign", time: "12:30PM – 1:00PM" },
        { title: "Next-Level Techniques in Photoshop", time: "12:00PM – 12:30PM" },
        { title: "New and Incredible Innovations in Photoshop", time: "2:30PM – 3:00PM" },
        { title: "Top Plays: 10 Adobe Fresco Tools/Features You Need to Use Now!", time: "2:30PM – 3:00PM" },
        { title: "Typographic Awareness: How Fonts Impact Meaning", time: "12:00PM – 12:30PM" },
        { title: "AI-Powered Creativity: A New Era with Microsoft Surface", time: "4:00PM – 4:30PM" },
        { title: "How Iconic Brands Use Color to Connect with Customers", time: "2:30PM – 3:00PM" },
        { title: "From Inspiration to Illustration: Believing in the Power of Beauty", time: "11:30AM – 12:00PM" },
        { title: "Making a Mark: From Analog to Digital and Back Again", time: "12:30PM – 1:00PM" }
      ],
      "Photography": [
        { title: "Level Up Your Editing Process with AI Tools in Lightroom", time: "4:00PM – 4:30PM" },
        { title: "How to Best Capture the Magic of a Destination in Photos", time: "12:00PM – 12:30PM" },
        { title: "Tips and Tricks to Increase a Photograph's Impact", time: "12:00PM – 12:30PM" },
        { title: "Mastering Low-Light Photography from Capture to Edit", time: "2:30PM – 3:00PM" },
        { title: "Optimize Lightroom Workflow with SanDisk Storage Solutions", time: "12:30PM – 1:00PM" },
        { title: "Portrait Photography Editing with AI", time: "2:30PM – 3:00PM" },
        { title: "Elevating Storytelling: Stylistic Consistency in Photography", time: "12:30PM – 1:00PM" },
        { title: "Mastering Masking: Enhancing Photos in Lightroom", time: "1:30AM – 2:00AM" }
      ],
      "Social media": [
        { title: "Building On-brand Teams with Adobe Express", time: "2:00PM – 2:30PM" },
        { title: "Beating Algorithms: Social Strategies for Driving Growth", time: "3:00PM – 3:30PM" },
        { title: "Elevating Your Social Media Content with Adobe Express", time: "12:30PM – 1:00PM" },
        { title: "Optimizing Social Content: A/B Strategies for Success", time: "4:00PM – 4:30PM" },
        { title: "Streamlining Social Media Asset Creation with Adobe Express", time: "11:30AM – 12:00PM" },
        { title: "Making Animated Artwork with Firefly and Adobe Express", time: "1:30AM – 2:00AM" }
      ],
      "Video": [
        { title: "After Effects 101: After Effects for New Users", time: "12:00PM – 12:30PM" },
        { title: "Moving Your Brand into Video", time: "1:00PM – 1:30PM" },
        { title: "Social Media Content Creation in the World of AI", time: "12:00PM – 12:30PM" },
        { title: "Animated Characters for Social Media: Character Animator", time: "2:30PM – 3:00PM" },
        { title: "Next-Generation Editing Workflows for Video Creators", time: "12:30PM – 1:00PM" },
        { title: "Quickly Scale Your Marketing Campaigns with AI Voice", time: "4:00PM – 4:30PM" },
        { title: "Post-production Magic with Latest Premiere Pro AI Features", time: "12:00PM – 12:30PM" },
        { title: "Enhancing Your Work Through Cinematic Color Grading", time: "1:00PM – 1:30PM" }
      ],
      "Generative AI": [
        { title: "AI-Powered Innovation: Leaping Ahead and Staying There", time: "1:00PM – 1:30PM" },
        { title: "Wicked Creativity Unlocked: Adobe Firefly Tricks and Treats", time: "2:00PM – 2:30PM" },
        { title: "Maximize Acrobat Efficiency with Generative AI", time: "3:00PM – 3:30PM" },
        { title: "Portrait Photography Editing with AI", time: "2:30PM – 3:00PM" },
        { title: "Enhancing Reading Visualization with Adobe Express & Gen AI", time: "12:30PM – 1:00PM" },
        { title: "Social Media Content Creation in the World of AI", time: "12:00PM – 12:30PM" },
        { title: "AI-Powered Creativity: A New Era with Microsoft Surface", time: "4:00PM – 4:30PM" },
        { title: "Level Up Your Editing Process with AI Tools in Lightroom", time: "4:00PM – 4:30PM" },
        { title: "Creativity Super Session: Human-Centered AI Strategies for Creative Leaders", time: "12:00AM – 1:00AM" }
      ],
      "Branding": [
        { title: "How Iconic Brands Use Color to Connect with Customers", time: "2:30PM – 3:00PM" },
        { title: "Building On-brand Teams with Adobe Express", time: "2:00PM – 2:30PM" },
        { title: "Unseen to Unforgettable: The Power of Personal Branding", time: "3:15PM – 4:15PM" },
        { title: "Moving Your Brand into Video", time: "1:00PM – 1:30PM" },
        { title: "Typographic Awareness: How Fonts Impact Meaning", time: "12:00PM – 12:30PM" },
        { title: "Designing a Book Cover: Inspiration and Design Tricks", time: "12:00PM – 12:30PM" },
        { title: "Sizzling Stats: How Texas Roadhouse Serves Up Creative ROI", time: "3:00PM – 3:30PM" },
        { title: "From Inspiration to Illustration: Believing in the Power of Beauty", time: "11:30AM – 12:00PM" }
      ],
      "Content Creator": [
        { title: "Elevating Your Social Media Content with Adobe Express", time: "12:30PM – 1:00PM" },
        { title: "Beating Algorithms: Social Strategies for Driving Growth", time: "3:00PM – 3:30PM" },
        { title: "Making Animated Artwork with Firefly and Adobe Express", time: "1:30AM – 2:00AM" },
        { title: "Optimizing Social Content: A/B Strategies for Success", time: "4:00PM – 4:30PM" },
        { title: "Streamlining Social Media Asset Creation with Adobe Express", time: "11:30AM – 12:00PM" },
        { title: "Next-Generation Editing Workflows for Video Creators", time: "12:30PM – 1:00PM" },
        { title: "Quick Hack: Animate Illustrations for Quick Content Creation", time: "1:30AM – 2:00AM" },
        { title: "After Effects 101: After Effects for New Users", time: "12:00PM – 12:30PM" }
      ]
    };
    // Apply real titles to upcoming session cards whose tag matches a channel with data
    const sessionCursors = {};
    document.querySelectorAll('.sessions-section:not(.past-sessions-section) .session-card').forEach(card => {
      const tag = card.querySelector('.session-tag')?.textContent?.trim();
      if (!tag || !realSessions[tag]) return;
      if (sessionCursors[tag] === undefined) sessionCursors[tag] = 0;
      const pool = realSessions[tag];
      const session = pool[sessionCursors[tag] % pool.length];
      sessionCursors[tag]++;
      const titleEl = card.querySelector('.session-card-title');
      if (titleEl) titleEl.textContent = session.title;
    });

    // Apply real titles to past session cards (continue from same cursors so titles vary)
    const pastCursors = {};
    document.querySelectorAll('.past-sessions-section .session-card').forEach(card => {
      const tag = card.querySelector('.session-tag')?.textContent?.trim();
      if (!tag || !realSessions[tag]) return;
      if (pastCursors[tag] === undefined) pastCursors[tag] = Math.floor(realSessions[tag].length / 2);
      const pool = realSessions[tag];
      const session = pool[pastCursors[tag] % pool.length];
      pastCursors[tag]++;
      const titleEl = card.querySelector('.session-card-title');
      if (titleEl) titleEl.textContent = session.title;
    });

    // ── Favorite & Schedule state ──────────────
    const favorited = new Set();
    const scheduled = new Set();
    let currentView = 'all';
    let onDemandActive = false;
    let channelFilter = new Set(); // active channel selections from filter panel
    let lastClickedCard = null;
    const rowResetFns = []; // filled by row scroll setup below

    // setVisible: animate-collapse hide/show for cards and rows.
    //   visible=false → fade + collapse, then display:none
    //   visible=true  → display:'' then expand (instant or animated)
    //   instant=true  → skip animation entirely
    function setVisible(el, visible, instant) {
      if (!el) return;
      const wasHidden = el.style.display === 'none';
      if (visible) {
        if (!wasHidden && !el.classList.contains('is-collapsing')) return;
        // Cancel any pending hide
        if (el._hideTimer) { clearTimeout(el._hideTimer); el._hideTimer = null; }
        el.style.display = '';
        el.classList.remove('is-collapsing');
      } else {
        if (wasHidden) return;
        if (instant) {
          el.style.display = 'none';
          el.classList.remove('is-collapsing');
          return;
        }
        el.classList.add('is-collapsing');
        if (el._hideTimer) clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => {
          el.style.display = 'none';
          el.classList.remove('is-collapsing');
          el._hideTimer = null;
        }, 500); // matches longest CSS transition (rows: 0.5s)
      }
    }

    // applyView: filter visible cards + rows based on currentView
    function applyView(instant = false) {
      const pastSection = document.getElementById('pastSessionsSection');
      const upcomingSection = document.querySelector('.sessions-section:not(.past-sessions-section)');
      const liveSection = document.querySelector('.live-section');
      const carouselArrow = document.getElementById('carouselNextBtn');
      const isPast = currentView === 'past';

      const isMyOnDemand = currentView === 'my' && onDemandActive;
      const sessionsTabBarEl = document.getElementById('sessionsTabBar');
      const upcomingHeadingEl = document.getElementById('upcomingHeading');

      // Show/hide tab bar, heading, and suggestion bar
      if (sessionsTabBarEl) sessionsTabBarEl.style.display = currentView === 'my' ? 'flex' : 'none';
      if (upcomingHeadingEl) upcomingHeadingEl.style.display = currentView === 'my' ? 'none' : '';
      const suggestionBarEl = document.getElementById('suggestionBar');
      if (suggestionBarEl) {
        suggestionBarEl.classList.add('visible');
        // Default position: before the upcoming sessions section
        // (for 'all' and on-demand views, repositioned later in this function)
        if (!isMyOnDemand && currentView !== 'all' && upcomingSection) {
          upcomingSection.before(suggestionBarEl);
        }
      }

      // Download button: only in My sessions
      const downloadBtnEl = document.querySelector('.download-btn');
      if (downloadBtnEl) downloadBtnEl.style.display = currentView === 'my' ? '' : 'none';

      // Toggle past vs. upcoming layout
      if (pastSection) pastSection.style.display = (isPast || isMyOnDemand) ? '' : 'none';
      if (upcomingSection) upcomingSection.style.display = (isPast || isMyOnDemand) ? 'none' : '';
      const isFutureDay = (currentDay === 'oct29' || currentDay === 'oct30');
      if (liveSection) liveSection.style.display = (isPast || isFutureDay) ? 'none' : '';
      if (featuredSectionEl) featuredSectionEl.style.display = (!isPast && isFutureDay) ? '' : 'none';

      if (isPast) {
        document.querySelectorAll('.past-sessions-section .session-card').forEach(c => c.style.display = '');
        document.querySelectorAll('.past-sessions-section .session-row').forEach(r => r.style.display = '');
        rowResetFns.forEach(fn => fn());
        return;
      }

      // On-demand tab: show past section filtered to scheduled sessions
      if (isMyOnDemand) {
        document.querySelectorAll('.past-sessions-section .session-row').forEach(row => {
          let visible = 0;
          row.querySelectorAll('.session-card').forEach(card => {
            const show = scheduled.has(card.dataset.sid);
            setVisible(card, show, instant);
            if (show) visible++;
          });
          setVisible(row, visible > 0, instant);
        });
        // Position suggestion bar immediately below the tab bar
        if (suggestionBarEl && sessionsTabBarEl) {
          sessionsTabBarEl.after(suggestionBarEl);
        }
        rowResetFns.forEach(fn => fn());
        return;
      }

      // Upcoming session rows / cards
      document.querySelectorAll('.sessions-section:not(.past-sessions-section) .session-row').forEach(row => {
        // 9:00AM row only appears on future days (Oct 29 / 30) — on Oct 28 the
        // Live Now section already represents the 9:00AM slot.
        if (row.id === 'sessionRow9am' && !isFutureDay) {
          setVisible(row, false, instant);
          return;
        }
        let visible = 0;
        const hiddenCards = [];
        row.querySelectorAll('.session-card').forEach(card => {
          let show = true;
          if (currentView === 'favorites') show = favorited.has(card.dataset.sid);
          else if (currentView === 'my') show = scheduled.has(card.dataset.sid);
          if (show && channelFilter.size > 0) {
            const tag = card.querySelector('.session-tag')?.textContent?.trim();
            show = channelFilter.has(tag);
          }
          if (show) {
            setVisible(card, true, instant);
            visible++;
          } else {
            hiddenCards.push(card);
          }
        });
        hiddenCards.forEach(c => setVisible(c, false, instant));
        setVisible(row, visible > 0, instant);
      });
      // Featured section cards (Oct 29 / Oct 30)
      if (!isPast && isFutureDay) {
        let visibleFeaturedCount = 0;
        featuredSectionEl.querySelectorAll('.live-card').forEach(card => {
          if (!card.dataset.sid) return;
          // Always show featured cards — they're suggestions, not filtered by schedule
          let show = currentView !== 'favorites';
          if (show && channelFilter.size > 0) {
            const badge = card.querySelector('.live-badge')?.textContent?.trim();
            show = channelFilter.has(badge);
          }
          setVisible(card, show, instant);
          if (show) visibleFeaturedCount++;
        });
        featuredSectionEl.style.display = visibleFeaturedCount > 0 ? '' : 'none';
        requestAnimationFrame(() => {
          const featuredNextBtn = document.getElementById('featuredNextBtn');
          const featuredPrevBtn = document.getElementById('featuredPrevBtn');
          const featuredArrows = featuredSectionEl ? featuredSectionEl.querySelector('.live-section-arrows') : null;
          if (featuredArrows) featuredArrows.style.display = visibleFeaturedCount <= 1 ? 'none' : '';
          if (featuredNextBtn) featuredNextBtn.disabled = false;
          if (featuredPrevBtn) featuredPrevBtn.disabled = true;
        });
      }

      // Live section cards
      if (!isPast && !isFutureDay) {
        let visibleLiveCount = 0;
        document.querySelectorAll('.live-card').forEach(card => {
          if (!card.dataset.sid) return;
          let show = (currentView === 'all') || favorited.has(card.dataset.sid) || scheduled.has(card.dataset.sid);
          if (currentView === 'my') show = scheduled.has(card.dataset.sid);
          if (currentView === 'favorites') show = favorited.has(card.dataset.sid);
          if (show && channelFilter.size > 0) {
            const badge = card.querySelector('.live-badge')?.textContent?.trim();
            show = channelFilter.has(badge);
          }
          setVisible(card, show, instant);
          if (show) visibleLiveCount++;
        });
        liveSection.style.display = visibleLiveCount > 0 ? '' : 'none';
        const livePrevBtn = document.getElementById('carouselPrevBtn');
        // Run after makeCarousel's rAF so our state wins
        requestAnimationFrame(() => {
          const liveArrows = liveSection ? liveSection.querySelector('.live-section-arrows') : null;
          if (liveArrows) liveArrows.style.display = visibleLiveCount <= 1 ? 'none' : '';
          if (carouselArrow) carouselArrow.disabled = false;
          if (livePrevBtn) livePrevBtn.disabled = true;
          // On tablet, clamp desc to 1 line when title wraps to 2 lines
          if (window.innerWidth <= 1023) {
            document.querySelectorAll('.live-card').forEach(card => {
              if (card.style.display === 'none') return;
              const title = card.querySelector('.live-title');
              const desc = card.querySelector('.live-desc');
              if (!title || !desc) return;
              desc.style.webkitLineClamp = title.getBoundingClientRect().height > 28 ? '1' : '2';
            });
          }
        });
      }
      // Position suggestion bar after the 2nd visible row for 'all' (Live & upcoming) view
      if (currentView === 'all' && upcomingSection && suggestionBarEl) {
        const visRows = [...upcomingSection.querySelectorAll(':scope > .session-row')]
          .filter(r => r.style.display !== 'none');
        const target = visRows[1] || visRows[0];
        if (target) target.after(suggestionBarEl);
      }

      // Reset row scroll positions so hidden-card offsets don't break layout
      rowResetFns.forEach(fn => fn());
    }

    // Toggle favorite for any card
    // ── Toast ──────────────────────────────────
    const toastEl = document.getElementById('toastEl');
    const toastTextEl = toastEl.querySelector('.toast-text');
    let toastTimer = null;
    const toastIconCheck = toastEl.querySelector('.toast-icon-check');
    const toastIconHeart = toastEl.querySelector('.toast-icon-heart');
    const toastIconAlert = toastEl.querySelector('.toast-icon-alert');
    function showToast(message, icon = 'check', type = 'default') {
      clearTimeout(toastTimer);
      toastEl.classList.remove('visible');
      void toastEl.offsetWidth;
      toastTextEl.textContent = message;
      toastIconCheck.style.display = icon === 'check' ? '' : 'none';
      toastIconHeart.style.display = icon === 'heart' ? '' : 'none';
      toastIconAlert.style.display = icon === 'alert' ? '' : 'none';
      toastEl.classList.toggle('alert-variant',   type === 'alert');
      toastEl.classList.toggle('success-variant', type === 'success');
      toastEl.classList.add('visible');
      toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 1500);
    }
    toastEl.querySelector('.toast-close').addEventListener('click', () => {
      toastEl.classList.remove('visible');
      clearTimeout(toastTimer);
    });

    function toggleFavorite(sid, heartIcon, favBtn) {
      if (favorited.has(sid)) {
        favorited.delete(sid);
        heartIcon.classList.remove('favorited');
        if (favBtn) {
          const txt = Array.from(favBtn.childNodes).find(n => n.nodeType === 3);
          if (txt) txt.textContent = 'Favorite';
        }
        showToast('Removed from favorites', 'heart');
      } else {
        favorited.add(sid);
        heartIcon.classList.add('favorited');
        if (favBtn) {
          const txt = Array.from(favBtn.childNodes).find(n => n.nodeType === 3);
          if (txt) txt.textContent = 'Favorited';
        }
        showToast('Added to favorites', 'heart', 'success');
      }
      if (currentView === 'favorites') applyView();
    }

    // Heart & calendar buttons on small session cards
    document.querySelectorAll('.session-card').forEach(card => {
      const isPast = !!card.closest('.past-sessions-section');

      // Helper: sync all heart icons in this card to current favorited state
      function syncHearts() {
        const isFav = favorited.has(card.dataset.sid);
        card.querySelectorAll('.icon-heart-sm').forEach(i => i.classList.toggle('favorited', isFav));
        // Card-level class so CSS can show the icon column always when active
        card.classList.toggle('is-favorited', isFav);
      }
      // Helper: sync all calendar icons in this card to current scheduled state
      function syncCals() {
        const isSched = scheduled.has(card.dataset.sid);
        card.querySelectorAll('.icon-calendar-sm').forEach(i => i.classList.toggle('scheduled', isSched));
        card.classList.toggle('is-scheduled', isSched);
      }

      // Helper: sync heart tooltip (no-op now — tooltips removed)
      function syncHeartTooltip() {}

      // Heart button (favorite)
      const heartBtn = card.querySelector('.card-icon-btn[data-action="favorite"]');
      const heartIcon = heartBtn && heartBtn.querySelector('.icon-heart-sm');
      if (heartBtn && heartIcon) {
        heartBtn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(card.dataset.sid, heartIcon, null); syncHearts(); syncHeartTooltip(); });
      }

      // Calendar button (schedule)
      const calBtn = card.querySelector('.card-icon-btn[data-action="schedule"]');
      const calIcon = calBtn && calBtn.querySelector('.icon-calendar-sm');
      if (isPast && calBtn) { calBtn.style.display = 'none'; }
      if (calBtn && calIcon && !isPast) {
        calBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (scheduled.has(card.dataset.sid)) {
            scheduled.delete(card.dataset.sid);
            showToast('Removed from schedule');
          } else {
            if (hasScheduleConflict(card.dataset.sid, card)) {
              openConflictModal(card.dataset.sid, card);
              return;
            }
            scheduled.add(card.dataset.sid);
            showToast('Added to schedule', 'check', 'success');
          }
          syncCals();
          if (currentView === 'my') applyView();
        });
      }
    });

    // ── Thumb button tooltips (body-level to escape overflow:hidden) ──
    const thumbTooltipEl = document.createElement('div');
    thumbTooltipEl.id = 'thumb-tooltip';
    document.body.appendChild(thumbTooltipEl);
    let tooltipHideTimer = null;
    document.addEventListener('mouseover', e => {
      const btn = e.target.closest('.card-icon-btn[data-tooltip]');
      if (!btn) return;
      clearTimeout(tooltipHideTimer);
      thumbTooltipEl.textContent = btn.dataset.tooltip;
      thumbTooltipEl.classList.add('visible');
      const r = btn.getBoundingClientRect();
      const tw = thumbTooltipEl.offsetWidth;
      thumbTooltipEl.style.left = (r.left + r.width / 2 - tw / 2) + 'px';
      thumbTooltipEl.style.top = (r.top - thumbTooltipEl.offsetHeight - 8) + 'px';
    });
    document.addEventListener('mouseout', e => {
      const btn = e.target.closest('.card-icon-btn[data-tooltip]');
      if (!btn) return;
      thumbTooltipEl.classList.remove('visible');
    });

    // Heart buttons on live cards
    document.querySelectorAll('.live-card').forEach(card => {
      const favBtn = card.querySelector('.btn-secondary');
      const heartIcon = favBtn && favBtn.querySelector('.icon-heart');
      if (favBtn && heartIcon) {
        favBtn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(card.dataset.sid, heartIcon, favBtn); });
      }
    });

    // ── Row scroll arrows ──────────────────────
    document.querySelectorAll('.session-row').forEach(row => {
      const scroll = row.querySelector('.session-cards-scroll');
      if (!scroll) return;

      const cardsRow = scroll.querySelector('.session-cards-row');
      function getGap() { return parseFloat(getComputedStyle(cardsRow).gap) || 18; }
      let cardIndex = 0;

      // Right button
      const rightBtn = document.createElement('button');
      rightBtn.className = 'row-scroll-btn right-btn';
      rightBtn.setAttribute('aria-label', 'Scroll right');
      rightBtn.innerHTML = '<span class="arrow-icon"></span>';
      row.appendChild(rightBtn);

      // Left button — positioned at the left edge of the scroll area
      const leftBtn = document.createElement('button');
      leftBtn.className = 'row-scroll-btn left-btn';
      leftBtn.setAttribute('aria-label', 'Scroll left');
      leftBtn.innerHTML = '<span class="arrow-icon"></span>';
      row.appendChild(leftBtn);

      requestAnimationFrame(() => {
        const rowRect = row.getBoundingClientRect();
        const scrollRect = scroll.getBoundingClientRect();
        leftBtn.style.left = (scrollRect.left - rowRect.left - 22) + 'px';
      });

      function getCardWidth() {
        // Use a non-collapsing card so we don't measure mid-animation widths
        const card = Array.from(scroll.querySelectorAll('.session-card')).find(c =>
          c.offsetParent !== null && !c.classList.contains('is-collapsing')
        );
        return card ? card.offsetWidth : 300;
      }

      function totalCards() {
        // Count only cards that are actually visible — exclude display:none
        // (offsetParent === null) and mid-collapse cards (is-collapsing).
        return Array.from(scroll.querySelectorAll('.session-card')).filter(c =>
          c.offsetParent !== null && !c.classList.contains('is-collapsing')
        ).length;
      }

      function updateBtns() {
        const cardW = getCardWidth();
        const gap = getGap();
        const n = totalCards();
        // Clamp cardIndex if filtering reduced the count
        if (cardIndex > Math.max(0, n - 1)) cardIndex = Math.max(0, n - 1);
        const remaining = n - cardIndex;
        const remainingWidth = remaining > 0 ? remaining * cardW + (remaining - 1) * gap : 0;
        rightBtn.classList.toggle('visible', remainingWidth > scroll.clientWidth + 1);
        leftBtn.classList.toggle('visible', cardIndex > 0);
      }

      function applyTransform(animate) {
        const cardW = getCardWidth();
        const gap = getGap();
        cardsRow.style.transition = animate ? 'transform 0.4s cubic-bezier(0.4,0,0.2,1)' : 'none';
        cardsRow.style.transform = `translateX(-${cardIndex * (cardW + gap)}px)`;
        updateBtns();
      }

      // Register reset so applyView() can restore scroll after filtering
      rowResetFns.push(() => { cardIndex = 0; applyTransform(false); });

      updateBtns();

      rightBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cardIndex = Math.min(cardIndex + 1, totalCards() - 1);
        applyTransform(true);
      });

      leftBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cardIndex = Math.max(cardIndex - 1, 0);
        applyTransform(true);
      });

      // ── Drag-to-scroll (tablet: transform-snap, mobile: native scroll) ──
      let dragActive = false, dragStartX = 0, dragStartTranslate = 0, dragStartScrollLeft = 0;
      let didDrag = false;

      cardsRow.addEventListener('pointerdown', e => {
        if (window.innerWidth > 1023) return; // desktop only uses buttons
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        dragActive = true;
        didDrag = false;
        dragStartX = e.clientX;
        if (window.innerWidth > 767) {
          // Tablet: transform-based
          const match = (cardsRow.style.transform || '').match(/-?[\d.]+/);
          dragStartTranslate = match ? parseFloat(match[0]) : 0;
          cardsRow.style.transition = 'none';
        } else {
          // Mobile: native scroll
          dragStartScrollLeft = cardsRow.scrollLeft;
        }
        cardsRow.setPointerCapture(e.pointerId);
      });

      cardsRow.addEventListener('pointermove', e => {
        if (!dragActive) return;
        const dx = e.clientX - dragStartX;
        if (Math.abs(dx) > 4) didDrag = true;
        if (!didDrag) return;
        if (window.innerWidth > 767) {
          // Tablet: clamp transform within valid range
          const minT = -((totalCards() - 1) * (getCardWidth() + getGap()));
          const clamped = Math.max(minT, Math.min(0, dragStartTranslate + dx));
          cardsRow.style.transform = `translateX(${clamped}px)`;
        } else {
          // Mobile: scroll
          cardsRow.scrollLeft = dragStartScrollLeft - dx;
        }
      });

      const endDrag = () => {
        if (!dragActive) return;
        dragActive = false;
        if (window.innerWidth > 767 && didDrag) {
          // Snap to nearest card
          const match = (cardsRow.style.transform || '').match(/-?[\d.]+/);
          const currentT = match ? Math.abs(parseFloat(match[0])) : 0;
          const step = getCardWidth() + getGap();
          cardIndex = Math.max(0, Math.min(Math.round(currentT / step), totalCards() - 1));
          applyTransform(true);
        }
      };

      cardsRow.addEventListener('pointerup', endDrag);
      cardsRow.addEventListener('pointercancel', endDrag);

      // Suppress click after a drag so cards don't open
      cardsRow.addEventListener('click', e => { if (didDrag) { e.stopPropagation(); e.preventDefault(); } }, true);
    });

    // Date tab interaction
    // ── Date tab switching ─────────────────────
    let currentDay = 'oct28';
    const liveSectionEl   = document.querySelector('.live-section:not(.featured-section)');
    const featuredSectionEl = document.getElementById('featuredSection');
    const sessionRow9amEl = document.getElementById('sessionRow9am');

    function setDay(day) {
      currentDay = day;
      const isFutureDay = (day === 'oct29' || day === 'oct30');
      if (liveSectionEl)    liveSectionEl.style.display    = isFutureDay ? 'none' : '';
      if (featuredSectionEl) featuredSectionEl.style.display = isFutureDay ? '' : 'none';
      if (sessionRow9amEl)  sessionRow9amEl.style.display  = isFutureDay ? '' : 'none';
      applyView();
    }

    document.querySelectorAll('.date-tab').forEach((tab, idx) => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        setDay(['oct28','oct29','oct30'][idx]);
      });
    });

    // ── Featured carousel ─────────────────────
    function makeCarousel(trackId, nextBtnId, prevBtnId, dotsContainerId, opts = {}) {
      const track = document.getElementById(trackId);
      const nextBtn = document.getElementById(nextBtnId);
      const prevBtn = document.getElementById(prevBtnId);
      const dots = [];
      const cards = track ? Array.from(track.querySelectorAll('.live-card')) : [];
      let idx = 0;
      function getGAP() { return track ? (parseFloat(getComputedStyle(track).gap) || 24) : 24; }

      function getCardW() { return cards[0] ? cards[0].offsetWidth : 1104; }

      function goTo(i, animate) {
        idx = Math.max(0, Math.min(i, cards.length - 1));
        track.style.transition = animate ? 'transform 0.4s cubic-bezier(0.4,0,0.2,1)' : 'none';
        track.style.transform = `translateX(-${idx * (getCardW() + getGAP())}px)`;
        dots.forEach((d, di) => d.classList.toggle('active', di === idx));
        if (opts.disableAtEdge) {
          if (nextBtn) { nextBtn.disabled = idx >= cards.length - 1; }
          if (prevBtn) { prevBtn.disabled = idx <= 0; }
        } else {
          if (nextBtn) nextBtn.style.display = idx >= cards.length - 1 ? 'none' : 'flex';
          if (prevBtn) prevBtn.style.display = idx <= 0 ? 'none' : 'flex';
        }
      }

      // Hide nav and dots if only 1 card
      const dotsContainer = document.getElementById(dotsContainerId);
      if (cards.length <= 1) {
        if (opts.disableAtEdge) {
          if (nextBtn) nextBtn.disabled = true;
          if (prevBtn) prevBtn.disabled = true;
        } else {
          if (nextBtn) nextBtn.style.display = 'none';
          if (prevBtn) prevBtn.style.display = 'none';
        }
        if (dotsContainer) dotsContainer.style.display = 'none';
      }
      if (nextBtn) nextBtn.addEventListener('click', e => { e.stopPropagation(); goTo(idx + 1, true); });
      if (prevBtn) prevBtn.addEventListener('click', e => { e.stopPropagation(); goTo(idx - 1, true); });
      dots.forEach((d, di) => d.addEventListener('click', () => goTo(di, true)));
      requestAnimationFrame(() => goTo(0, false));
    }

    makeCarousel('liveCardTrack',     'carouselNextBtn', 'carouselPrevBtn', 'liveDots', { disableAtEdge: true });
    makeCarousel('featuredCardTrack', 'featuredNextBtn', 'featuredPrevBtn', 'featuredDots', { disableAtEdge: true });

    // ── All sessions dropdown ──────────────────
    const sessionsBtn = document.getElementById('sessionsBtn');
    const sessionsMenu = document.getElementById('sessionsMenu');

    sessionsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sessionsMenu.classList.contains('open');
      closeAll();
      if (!isOpen) {
        sessionsMenu.classList.add('open');
        sessionsBtn.classList.add('open');
        sessionsBtn.setAttribute('aria-expanded', 'true');
      }
    });

    sessionsMenu.querySelectorAll('.sessions-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        // Update selected state
        sessionsMenu.querySelectorAll('.sessions-menu-item').forEach(i => {
          i.classList.remove('selected');
          const check = i.querySelector('.check-icon');
          if (check) { check.outerHTML = '<span class="check-placeholder"></span>'; }
        });
        item.classList.add('selected');
        const placeholder = item.querySelector('.check-placeholder');
        if (placeholder) {
          placeholder.outerHTML = `<svg class="check-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        }
        // Update button label
        sessionsBtn.childNodes[0].textContent = item.textContent.trim();
        // Apply view filter
        currentView = item.dataset.value; // 'all' | 'my' | 'favorites' | 'past'
        if (currentView !== 'my') onDemandActive = false;
        document.querySelector('.date-tabs').classList.toggle('tabs-disabled', currentView === 'past');
        applyView(true); // instant — view switches don't animate per UX decision
        closeAll();
      });
    });

    // ── Session tabs (Upcoming / On-demand) ───
    const tabUpcomingEl  = document.getElementById('tabUpcoming');
    const tabOnDemandEl  = document.getElementById('tabOnDemand');
    function setSessionTab(demand) {
      onDemandActive = demand;
      tabUpcomingEl.classList.toggle('active', !demand);
      tabOnDemandEl.classList.toggle('active', demand);
      applyView(true);
    }
    if (tabUpcomingEl)  tabUpcomingEl.addEventListener('click',  () => setSessionTab(false));
    if (tabOnDemandEl) tabOnDemandEl.addEventListener('click', () => setSessionTab(true));

    // ── Filter panel ──────────────────────────

    // ── Category data ─────────────────────────
    const CHECK_SVG = `<svg class="opt-check" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8L6.5 11.5L13 4.5" stroke="black" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const filterData = {
      'Channel': [
        { label: 'Mainstage' }, { label: 'Generative AI' },
        { label: 'Business' },
        { label: '3D' }, { label: 'Branding' }, { label: 'Education' }, { label: 'Social media' },
        { label: 'Photography' }, { label: 'Video' }, { label: 'Design & Illustration' }, { label: 'Content Creator' },
      ],
      'Type': [
        { label: 'Creativity Super Session' }, { label: 'First Take' }, { label: 'Keynote' },
        { label: 'Luminary Session' },
        { label: 'Meet the Speaker' }, { label: 'Session' }, { label: 'Sneaks' },
      ],
      'Format': [],
      'Technical level': [],
      'Product': [
        { label: 'Acrobat', icon: "https://www.adobe.com/content/dam/cc/icons/acrobat-pro.svg" },
        { label: 'Adobe Express', icon: "https://www.adobe.com/content/dam/cc/icons/adobe-express.svg" },
        { label: 'Adobe Firefly', icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20240%20240%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22ffg%22%20x1%3D%220%25%22%20y1%3D%220%25%22%20x2%3D%22100%25%22%20y2%3D%22100%25%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23FF4500%22%2F%3E%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22%23FF0080%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%238B00FF%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22240%22%20height%3D%22240%22%20rx%3D%2246%22%20fill%3D%22%230A0A0A%22%2F%3E%3Ctext%20x%3D%22120%22%20y%3D%22160%22%20font-size%3D%22110%22%20font-family%3D%22Helvetica%20Neue%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20fill%3D%22url%28%23ffg%29%22%20text-anchor%3D%22middle%22%3EFf%3C%2Ftext%3E%3C%2Fsvg%3E" },
        { label: 'Adobe Fonts', icon: "https://www.adobe.com/content/dam/cc/icons/adobe-fonts.svg" },
        { label: 'Adobe Fresco', icon: "https://www.adobe.com/content/dam/cc/icons/fresco.svg" },
        { label: 'Adobe Stock', icon: "https://www.adobe.com/content/dam/cc/icons/stock.svg" },
        { label: 'Adobe Workfront', icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20240%20240%22%3E%3Crect%20width%3D%22240%22%20height%3D%22240%22%20rx%3D%2246%22%20fill%3D%22%230B84A5%22%2F%3E%3Ctext%20x%3D%22120%22%20y%3D%22160%22%20font-size%3D%22110%22%20font-family%3D%22Helvetica%20Neue%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%3EWf%3C%2Ftext%3E%3C%2Fsvg%3E" },
        { label: 'After Effects', icon: "https://www.adobe.com/content/dam/cc/icons/aftereffects.svg" },
        { label: 'Creative Cloud', icon: "https://www.adobe.com/content/dam/cc/icons/creativecloud.svg" },
        { label: 'Frame.io', icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20240%20240%22%3E%3Crect%20width%3D%22240%22%20height%3D%22240%22%20rx%3D%2246%22%20fill%3D%22%231F2428%22%2F%3E%3Ctext%20x%3D%22120%22%20y%3D%22160%22%20font-size%3D%22110%22%20font-family%3D%22Helvetica%20Neue%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%3EFr%3C%2Ftext%3E%3C%2Fsvg%3E" },
        { label: 'GenStudio', icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20240%20240%22%3E%3Crect%20width%3D%22240%22%20height%3D%22240%22%20rx%3D%2246%22%20fill%3D%22%238B4FD4%22%2F%3E%3Ctext%20x%3D%22120%22%20y%3D%22160%22%20font-size%3D%22110%22%20font-family%3D%22Helvetica%20Neue%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%3EGs%3C%2Ftext%3E%3C%2Fsvg%3E" },
        { label: 'Illustrator', icon: "https://www.adobe.com/content/dam/cc/icons/illustrator.svg" },
        { label: 'InDesign', icon: "https://www.adobe.com/content/dam/cc/icons/indesign.svg" },
        { label: 'Lightroom', icon: "https://www.adobe.com/content/dam/cc/icons/lightroom-classic.svg" },
        { label: 'Lightroom Classic', icon: "https://www.adobe.com/content/dam/cc/icons/lightroom-classic.svg" },
        { label: 'Lightroom on mobile', icon: "https://www.adobe.com/content/dam/cc/icons/lightroom-classic.svg" },
        { label: 'Photoshop', icon: "https://www.adobe.com/content/dam/cc/icons/photoshop.svg" },
        { label: 'Photoshop Express', icon: "https://www.adobe.com/content/dam/cc/icons/photoshop-express.svg" },
        { label: 'Premiere', icon: "https://www.adobe.com/content/dam/cc/icons/premiere.svg" },
        { label: 'Project Neo (beta)', icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20240%20240%22%3E%3Crect%20width%3D%22240%22%20height%3D%22240%22%20rx%3D%2246%22%20fill%3D%22%23300060%22%2F%3E%3Ctext%20x%3D%22120%22%20y%3D%22160%22%20font-size%3D%22110%22%20font-family%3D%22Helvetica%20Neue%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%3ENeo%3C%2Ftext%3E%3C%2Fsvg%3E" },
        { label: 'Substance 3D Painter', icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20240%20240%22%3E%3Crect%20width%3D%22240%22%20height%3D%22240%22%20rx%3D%2246%22%20fill%3D%22%23DB5C3A%22%2F%3E%3Ctext%20x%3D%22120%22%20y%3D%22160%22%20font-size%3D%22110%22%20font-family%3D%22Helvetica%20Neue%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%3EPt%3C%2Ftext%3E%3C%2Fsvg%3E" },
        { label: 'Substance 3D Sampler', icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20240%20240%22%3E%3Crect%20width%3D%22240%22%20height%3D%22240%22%20rx%3D%2246%22%20fill%3D%22%232B8C68%22%2F%3E%3Ctext%20x%3D%22120%22%20y%3D%22160%22%20font-size%3D%22110%22%20font-family%3D%22Helvetica%20Neue%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%3ESa%3C%2Ftext%3E%3C%2Fsvg%3E" },
        { label: 'Substance 3D Stager', icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20240%20240%22%3E%3Crect%20width%3D%22240%22%20height%3D%22240%22%20rx%3D%2246%22%20fill%3D%22%2336A832%22%2F%3E%3Ctext%20x%3D%22120%22%20y%3D%22160%22%20font-size%3D%22110%22%20font-family%3D%22Helvetica%20Neue%2CArial%2Csans-serif%22%20font-weight%3D%22800%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%3ESg%3C%2Ftext%3E%3C%2Fsvg%3E" },
        { label: 'Not product specific', icon: null },
      ],
      'Category': [],
      'Audience': [],
      'Region': [],
    };

    // Per-category selected state (separate from defaults above)
    const selectedState = {};
    Object.keys(filterData).forEach(cat => {
      selectedState[cat] = new Set(
        filterData[cat].filter(o => o.selected).map(o => o.label)
      );
    });

    let activeCategory = 'Channel';

    // ── Render options for a category ─────────
    function renderCategory(catName) {
      const grid = document.getElementById('filterOptionsGrid');
      const options = filterData[catName] || [];
      const selected = selectedState[catName];

      if (options.length === 0) {
        grid.innerHTML = `<p style="color:rgba(0,0,0,0.15);font-size:80px;font-weight:900;letter-spacing:-2px;line-height:1;padding:24px 4px;margin:0;font-family:'Adobe Clean Display',system-ui,sans-serif;">FPO</p>`;
        return;
      }

      grid.innerHTML = options.map(opt => {
        const isSelected = selected.has(opt.label);
        const iconHTML = opt.icon
          ? `<img class="filter-option-icon" src="${opt.icon}" alt="" />`
          : '';
        const check = isSelected ? CHECK_SVG : '';
        const selClass = isSelected ? ' selected' : '';
        const hasIcon = opt.icon ? ' has-icon' : '';
        return `<div class="filter-option${selClass}${hasIcon}" data-label="${opt.label.replace(/"/g,'&quot;')}">${iconHTML}<span class="opt-label">${opt.label}</span>${check}</div>`;
      }).join('');

      // Attach toggle listeners
      grid.querySelectorAll('.filter-option').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const label = el.dataset.label;
          if (selectedState[activeCategory].has(label)) {
            selectedState[activeCategory].delete(label);
            el.classList.remove('selected');
            const chk = el.querySelector('.opt-check');
            if (chk) chk.remove();
          } else {
            selectedState[activeCategory].add(label);
            el.classList.add('selected');
            if (!el.querySelector('.opt-check')) el.insertAdjacentHTML('beforeend', CHECK_SVG);
          }
        });
      });
    }

    // ── Filter panel toggle ────────────────────
    const filterBtn = document.getElementById('filterBtn');
    const filterPanel = document.getElementById('filterPanel');

    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = filterPanel.classList.contains('open');
      closeAll();
      if (!isOpen) {
        filterPanel.classList.add('open');
        filterBtn.classList.add('open');
        filterBtn.setAttribute('aria-expanded', 'true');
        renderCategory(activeCategory);
      }
    });

    // ── Category switching ─────────────────────
    filterPanel.querySelectorAll('.filter-category').forEach(cat => {
      cat.addEventListener('click', (e) => {
        e.stopPropagation();
        filterPanel.querySelectorAll('.filter-category').forEach(c => c.classList.remove('active'));
        cat.classList.add('active');
        activeCategory = cat.textContent.trim();
        renderCategory(activeCategory);
      });
    });

    // ── Apply / Reset ──────────────────────────
    function updateFilterBtn() {
      const total = Object.values(selectedState).reduce((sum, s) => sum + s.size, 0);
      const label = filterBtn.querySelector('.filter-btn-label');
      if (total > 0) {
        label.textContent = `Filters added (${total})`;
      } else {
        label.textContent = 'Filter';
      }
    }

    document.querySelector('.filter-apply-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      // Apply channel filter from selected state
      channelFilter = new Set(selectedState['Channel']);
      applyView();
      updateFilterBtn();
      closeAll();
    });
    document.querySelector('.filter-reset-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      Object.keys(selectedState).forEach(cat => selectedState[cat].clear());
      channelFilter = new Set();
      renderCategory(activeCategory);
      applyView();
      updateFilterBtn();
    });

    // Clicks inside the panel don't bubble up to closeAll
    filterPanel.addEventListener('click', (e) => e.stopPropagation());

    // ── Close all on outside click ─────────────
    // ── Search toggle ──────────────────────────
    const searchBtnEl = document.getElementById('searchBtn');
    const searchInputEl = document.getElementById('searchInput');
    const searchClearBtnEl = document.getElementById('searchClearBtn');
    const mobileSearchRowEl = document.getElementById('mobileSearchRow');
    const mobileSearchInputEl = document.getElementById('mobileSearchInput');
    const mobileSearchClearBtnEl = document.getElementById('mobileSearchClearBtn');
    const rightControlsEl = document.querySelector('.right-controls');

    function isMobileBreakpoint() { return window.innerWidth <= 767; }

    function filterSessions(query) {
      const q = query.trim().toLowerCase();
      document.querySelectorAll('.session-row, .past-row').forEach(row => {
        let visible = 0;
        row.querySelectorAll('.session-card').forEach(card => {
          const title = card.querySelector('.session-card-title')?.textContent?.toLowerCase() || '';
          const tag = card.querySelector('.session-tag')?.textContent?.toLowerCase() || '';
          const match = !q || title.includes(q) || tag.includes(q);
          card.style.display = match ? '' : 'none';
          if (match) visible++;
        });
        if (q) row.style.display = visible ? '' : 'none';
        else row.style.display = '';
      });
    }

    function openSearch() {
      closeAll();
      if (isMobileBreakpoint()) {
        mobileSearchRowEl.classList.add('open');
        searchBtnEl.classList.add('active');
        mobileSearchInputEl.focus();
      } else {
        rightControlsEl.classList.add('search-active');
        searchInputEl.focus();
      }
    }

    function closeSearch() {
      rightControlsEl.classList.remove('search-active');
      mobileSearchRowEl.classList.remove('open');
      searchBtnEl.classList.remove('active');
      searchInputEl.value = '';
      mobileSearchInputEl.value = '';
      applyView(true);
    }

    searchBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = rightControlsEl.classList.contains('search-active') || mobileSearchRowEl.classList.contains('open');
      if (isOpen) closeSearch();
      else openSearch();
    });

    searchInputEl.addEventListener('input', () => filterSessions(searchInputEl.value));
    mobileSearchInputEl.addEventListener('input', () => filterSessions(mobileSearchInputEl.value));

    searchClearBtnEl.addEventListener('click', (e) => { e.stopPropagation(); closeSearch(); });
    mobileSearchClearBtnEl.addEventListener('click', (e) => { e.stopPropagation(); closeSearch(); });

    // Stop clicks inside search field from closing via document listener
    document.getElementById('searchFieldWrap').addEventListener('click', e => e.stopPropagation());
    mobileSearchRowEl.addEventListener('click', e => e.stopPropagation());

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });

    function closeAll() {
      sessionsMenu.classList.remove('open');
      sessionsBtn.classList.remove('open');
      sessionsBtn.setAttribute('aria-expanded', 'false');
      filterPanel.classList.remove('open');
      filterBtn.classList.remove('open');
      filterBtn.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('click', closeAll);

    // ── Drawer open/close with peek-to-expand ─
    const drawerEl = document.getElementById('drawerEl');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const seeAllBtn = document.getElementById('seeAllBtn');
    const bodyScrollEl = document.querySelector('.body-scroll');

    const TOP_MARGIN = 20; // px gap between drawer top and viewport top when fully expanded
    let currentTop = 0;       // current `top` value in px
    let drawerFullyExpanded = false;

    function setDrawerTop(top, animate) {
      drawerEl.style.transition = animate
        ? 'top 0.45s cubic-bezier(0.4, 0, 0.2, 1)'
        : 'top 0.08s linear';
      drawerEl.style.top = top + 'px';
      currentTop = top;
    }

    function openDrawer() {
      drawerEl.classList.add('open');
      drawerOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      drawerFullyExpanded = false;
      if (bodyScrollEl) bodyScrollEl.scrollTop = 0;
      // Initial peek: show header + live/featured section (if visible) + 2.5 session rows
      const headerH = document.querySelector('.header').offsetHeight;
      const visibleLive = [...document.querySelectorAll('.live-section')].find(el => el.offsetHeight > 0);
      const liveH = visibleLive ? visibleLive.offsetHeight : 0;
      const visibleRow = [...document.querySelectorAll('.session-row')].find(el => el.offsetHeight > 0);
      const rowH = visibleRow ? visibleRow.offsetHeight : 0;
      const peekHeight = headerH + liveH + rowH * 0.5;
      const peekTop = Math.max(TOP_MARGIN, Math.round(window.innerHeight - peekHeight));
      // Jump to off-screen, then animate to peek
      drawerEl.style.transition = 'none';
      drawerEl.style.top = '100vh';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setDrawerTop(peekTop, true);
        });
      });
    }

    function closeDrawer() {
      drawerEl.style.transition = 'top 0.45s cubic-bezier(0.4, 0, 0.2, 1)';
      drawerEl.style.top = '100vh';
      drawerEl.classList.remove('open');
      drawerOverlay.classList.remove('open');
      document.body.style.overflow = '';
      drawerFullyExpanded = false;
    }

    // Wheel: expand drawer on scroll-down while peeking
    drawerEl.addEventListener('wheel', (e) => {
      if (!drawerEl.classList.contains('open')) return;
      if (drawerFullyExpanded) return; // let body-scroll handle it

      e.preventDefault();
      if (e.deltaY > 0) {
        const newTop = Math.max(TOP_MARGIN, currentTop - Math.abs(e.deltaY) * 1.2);
        if (newTop <= TOP_MARGIN) {
          drawerFullyExpanded = true;
          setDrawerTop(TOP_MARGIN, true);
        } else {
          setDrawerTop(newTop, false);
        }
      }
    }, { passive: false });

    // Touch: expand drawer on swipe-up while peeking
    let touchPrevY = 0;
    drawerEl.addEventListener('touchstart', (e) => {
      touchPrevY = e.touches[0].clientY;
    }, { passive: true });
    drawerEl.addEventListener('touchmove', (e) => {
      if (!drawerEl.classList.contains('open') || drawerFullyExpanded) return;
      const delta = touchPrevY - e.touches[0].clientY; // positive = swipe up
      touchPrevY = e.touches[0].clientY;
      if (delta > 0) {
        const newTop = Math.max(TOP_MARGIN, currentTop - delta * 1.5);
        if (newTop <= TOP_MARGIN) {
          drawerFullyExpanded = true;
          setDrawerTop(TOP_MARGIN, true);
        } else {
          setDrawerTop(newTop, false);
        }
        e.preventDefault();
      }
    }, { passive: false });

    seeAllBtn.addEventListener('click', openDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);

    // ── Session detail overlay ─────────────────
    const sessionDetail = document.getElementById('sessionDetail');
    const detailBackBtn = document.getElementById('detailBackBtn');
    const mainCloseBtn = document.querySelector('.header .close-btn');

    const detailHeartBtn = document.querySelector('.detail-icon-btn[aria-label="Favorite"]');
    const detailHeartIcon = detailHeartBtn && detailHeartBtn.querySelector('.icon-heart-detail');
    const detailWatchBtn = document.querySelector('.detail-watch-btn');

    function syncDetailScheduleBtn(sid) {
      if (!detailWatchBtn) return;
      const isScheduled = scheduled.has(sid);
      detailWatchBtn.classList.toggle('scheduled-active', isScheduled);
      detailWatchBtn.innerHTML = `<span class="icon-calendar-detail${isScheduled ? ' scheduled' : ''}"></span>${isScheduled ? 'Scheduled' : 'Add to schedule'}`;
    }

    function openDetail(clickedCard) {
      lastClickedCard = clickedCard;
      const sid = clickedCard.dataset.sid;
      const isFeatured = !!clickedCard.closest('.featured-section');
      const isLive = clickedCard.classList.contains('live-card') && !isFeatured;

      // Sync title, badge, time from the clicked card
      const detailTitle = document.querySelector('.detail-session-title');
      const detailBadge = document.querySelector('.detail-badge');
      const detailTime  = document.querySelector('.detail-time');
      if (isLive || isFeatured) {
        if (detailTitle) detailTitle.textContent = clickedCard.querySelector('.live-title')?.textContent || '';
        if (detailTime)  detailTime.textContent  = clickedCard.querySelector('.live-time')?.textContent  || '';
        if (detailBadge) {
          const badgeText = clickedCard.querySelector('.live-badge')?.textContent || '';
          const cat = tagToCat(badgeText);
          detailBadge.innerHTML = renderTagContent(badgeText, cat);
          if (cat) detailBadge.setAttribute('data-cat', cat);
          else detailBadge.removeAttribute('data-cat');
        }
      } else {
        if (detailTitle) detailTitle.textContent = clickedCard.querySelector('.session-card-title')?.textContent || '';
        if (detailTime)  detailTime.textContent  = clickedCard.querySelector('.session-card-time')?.textContent || '';
        if (detailBadge) {
          const srcTag = clickedCard.querySelector('.session-tag');
          if (srcTag) {
            detailBadge.innerHTML = srcTag.innerHTML;
            const cat = srcTag.dataset.cat || '';
            if (cat) detailBadge.setAttribute('data-cat', cat);
            else detailBadge.removeAttribute('data-cat');
          }
        }
      }

      // Sync detail heart
      if (detailHeartIcon) {
        detailHeartIcon.classList.toggle('favorited', favorited.has(sid));
      }

      // Swap action button based on card type
      const isOnDemand = !isLive && clickedCard.querySelector('.session-card-time')?.textContent === 'On-demand';
      const isIpod = clickedCard.dataset.ipod === 'true';
      if (detailWatchBtn) {
        if (isIpod) {
          detailWatchBtn.style.display = 'none';
        } else {
          detailWatchBtn.style.display = '';
          if (isLive || isOnDemand) {
            detailWatchBtn.classList.remove('schedule-mode', 'scheduled-active');
            detailWatchBtn.innerHTML = '<span class="icon-play"></span>Watch now';
          } else {
            detailWatchBtn.classList.add('schedule-mode');
            syncDetailScheduleBtn(sid);
          }
        }
      }

      sessionDetail.classList.add('open');
      drawerEl.classList.add('detail-open');
      history.pushState({ detailOpen: true }, '');
    }
    function closeDetail() {
      sessionDetail.classList.remove('open');
      drawerEl.classList.remove('detail-open');
    }

    // ── On-demand Session Page ────────────────────
    const sessionPage   = document.getElementById('sessionPage');
    const spFavBtn      = document.getElementById('spFavBtn');
    const spBadgeTagEl  = document.getElementById('spBadgeTag');
    const spTitleEl     = document.getElementById('spTitle');

    function syncSpFavorite(sid) {
      if (!spFavBtn) return;
      const isFav = sid != null && favorited.has(String(sid));
      spFavBtn.classList.toggle('sp-favorited', isFav);
      const heartSvg = isFav
        ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`
        : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`;
      spFavBtn.innerHTML = `${heartSvg}${isFav ? 'Favorited' : 'Favorite'}`;
    }

    function openSessionPage(card) {
      if (!sessionPage) return;
      lastClickedCard = card;
      const sid = card.dataset.sid;

      // Title
      if (spTitleEl) spTitleEl.textContent = card.querySelector('.session-card-title')?.textContent || '';

      // Category badge
      if (spBadgeTagEl) {
        const srcTag = card.querySelector('.session-tag');
        if (srcTag) {
          spBadgeTagEl.innerHTML = srcTag.innerHTML;
          const cat = srcTag.dataset.cat || '';
          if (cat) spBadgeTagEl.setAttribute('data-cat', cat);
          else spBadgeTagEl.removeAttribute('data-cat');
        }
      }

      syncSpFavorite(sid);
      sessionPage.classList.add('open');
      sessionPage.scrollTop = 0;
      history.pushState({ sessionPage: true }, '');
    }

    function closeSessionPage() {
      if (sessionPage) sessionPage.classList.remove('open');
    }

    // ── Livestream page ──────────────────────────────
    const livestreamPage    = document.getElementById('livestreamPage');
    const lsBackBtn         = document.getElementById('lsBackBtn');
    const lsCaption         = document.getElementById('lsCaption');
    const lsSessionTitleBar = document.getElementById('lsSessionTitleBar');

    function openLivestreamPage(card) {
      const title = card.querySelector('.live-title')?.textContent.trim()
                 || card.querySelector('.session-card-title')?.textContent.trim()
                 || 'Live Session';
      if (lsCaption) lsCaption.textContent = title;
      if (lsSessionTitleBar) lsSessionTitleBar.textContent = title;
      livestreamPage.classList.add('open');
      livestreamPage.scrollTop = 0;
      history.pushState({ livestreamPage: true }, '');
    }

    function closeLivestreamPage() {
      if (livestreamPage) livestreamPage.classList.remove('open');
    }

    if (lsBackBtn) {
      lsBackBtn.addEventListener('click', () => {
        history.back();
      });
    }

    if (spFavBtn) {
      spFavBtn.addEventListener('click', () => {
        if (!lastClickedCard) return;
        const sid = lastClickedCard.dataset.sid;
        if (favorited.has(sid)) {
          favorited.delete(sid);
          showToast('Removed from favorites', 'heart');
        } else {
          favorited.add(sid);
          showToast('Added to favorites', 'heart', 'success');
        }
        syncSpFavorite(sid);
        const srcHeart = lastClickedCard.querySelector('.icon-heart-sm, .icon-heart');
        if (srcHeart) srcHeart.classList.toggle('favorited', favorited.has(sid));
        if (currentView === 'favorites') applyView();
      });
    }

    window.addEventListener('popstate', () => {
      if (livestreamPage && livestreamPage.classList.contains('open')) {
        closeLivestreamPage();
      } else if (sessionPage && sessionPage.classList.contains('open')) {
        closeSessionPage();
      } else if (sessionDetail.classList.contains('open')) {
        closeDetail();
      }
    });

    // Detail schedule button — syncs back to the source card's calendar icon
    if (detailWatchBtn) {
      detailWatchBtn.addEventListener('click', () => {
        if (!lastClickedCard) return;
        // Watch now (live / on-demand) — route to livestream page
        if (!detailWatchBtn.classList.contains('schedule-mode')) {
          closeDetail();
          openLivestreamPage(lastClickedCard);
          return;
        }
        const sid = lastClickedCard.dataset.sid;
        const wasScheduled = scheduled.has(sid);
        if (wasScheduled) {
          scheduled.delete(sid);
          showToast('Removed from schedule');
        } else {
          if (hasScheduleConflict(sid, lastClickedCard)) {
            openConflictModal(sid, lastClickedCard);
            return;
          }
          scheduled.add(sid);
          showToast('Added to schedule', 'check', 'success');
        }
        syncDetailScheduleBtn(sid);
        // Sync source card calendar icon
        const srcCal = lastClickedCard.querySelector('.icon-calendar-sm');
        if (srcCal) srcCal.classList.toggle('scheduled', scheduled.has(sid));
        if (currentView === 'my') applyView();
      }, true); // use capture to fire before innerHTML recreates children
    }

    // Detail heart button — syncs back to the source card
    if (detailHeartBtn && detailHeartIcon) {
      detailHeartBtn.addEventListener('click', () => {
        if (!lastClickedCard) return;
        const sid = lastClickedCard.dataset.sid;
        // Toggle favorite
        if (favorited.has(sid)) {
          favorited.delete(sid);
          detailHeartIcon.classList.remove('favorited');
          showToast('Removed from favorites', 'heart');
        } else {
          favorited.add(sid);
          detailHeartIcon.classList.add('favorited');
          showToast('Added to favorites', 'heart', 'success');
        }
        // Sync the source card's heart icon
        const srcHeart = lastClickedCard.querySelector('.icon-heart-sm, .icon-heart');
        if (srcHeart) srcHeart.classList.toggle('favorited', favorited.has(sid));
        // Sync live card button text if applicable
        const liveFavBtn = lastClickedCard.querySelector('.btn-secondary');
        if (liveFavBtn) {
          const txt = Array.from(liveFavBtn.childNodes).find(n => n.nodeType === 3);
          if (txt) txt.textContent = favorited.has(sid) ? 'Favorited' : 'Favorite';
        }
        if (currentView === 'favorites') applyView();
      });
    }

    // Open on session card click — on-demand cards route to session page
    document.querySelectorAll('.session-card').forEach(card => {
      card.addEventListener('click', () => {
        const timeText = card.querySelector('.session-card-time')?.textContent.trim() || '';
        const isOnDemand = timeText === 'On-demand';
        if (isOnDemand) {
          openSessionPage(card);
        } else {
          openDetail(card);
        }
      });
    });

    // Open on live card click — Watch now routes to livestream, rest opens detail
    document.querySelectorAll('.live-card').forEach(card => {
      // Intercept Watch now button specifically
      const watchNowBtn = card.querySelector('.btn-primary');
      if (watchNowBtn) {
        watchNowBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openLivestreamPage(card);
        });
      }
      // Card body click (not Watch now) still opens detail
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-primary')) return; // already handled
        openDetail(card);
      });
    });

    // ── Pre-populate My sessions ───────────────
    (function() {
      const allCards = Array.from(document.querySelectorAll('.sessions-section:not(.past-sessions-section) .session-card[data-sid]'));
      // Seed-based shuffle so it's stable on reload
      const seed = 42;
      const rng = (function(s) { return function() { s = Math.imul(48271, s) | 0; return (s & 0x7fffffff) / 0x7fffffff; }; })(seed);
      const shuffled = allCards.slice().sort(() => rng() - 0.5);
      // Schedule roughly 30% of cards, skipping any that conflict with already-scheduled ones
      const target = Math.round(allCards.length * 0.3);
      let added = 0;
      const scheduledCards = [];
      for (const card of shuffled) {
        if (added >= target) break;
        if (hasScheduleConflict(card.dataset.sid, card)) continue;
        scheduled.add(card.dataset.sid);
        card.querySelectorAll('.icon-calendar-sm').forEach(i => i.classList.add('scheduled'));
        card.classList.add('is-scheduled');
        scheduledCards.push(card);
        added++;
      }
      // Add first live card to schedule
      const firstLiveCard = document.querySelector('.live-card[data-sid]');
      if (firstLiveCard) scheduled.add(firstLiveCard.dataset.sid);

      // Pre-favorite ~40% of scheduled upcoming sessions (seeded for stability)
      const favRng = (function(s) { return function() { s = Math.imul(48271, s) | 0; return (s & 0x7fffffff) / 0x7fffffff; }; })(77);
      const favShuffled = scheduledCards.slice().sort(() => favRng() - 0.5);
      const favTarget = Math.round(scheduledCards.length * 0.4);
      favShuffled.slice(0, favTarget).forEach(card => {
        favorited.add(card.dataset.sid);
        card.querySelectorAll('.icon-heart-sm').forEach(i => i.classList.add('favorited'));
        card.classList.add('is-favorited');
      });

      // Pre-schedule ~40% of past sessions (seeded for stability)
      const pastCards = Array.from(document.querySelectorAll('.past-sessions-section .session-card[data-sid]'));
      const pastRng = (function(s) { return function() { s = Math.imul(48271, s) | 0; return (s & 0x7fffffff) / 0x7fffffff; }; })(99);
      const pastShuffled = pastCards.slice().sort(() => pastRng() - 0.5);
      const pastTarget = Math.round(pastCards.length * 0.4);
      pastShuffled.slice(0, pastTarget).forEach(card => {
        scheduled.add(card.dataset.sid);
        card.querySelectorAll('.icon-calendar-sm').forEach(i => i.classList.add('scheduled'));
        card.classList.add('is-scheduled');
        const pastCalBtn = card.querySelector('.card-icon-btn[data-action="schedule"]');
        if (pastCalBtn) pastCalBtn.style.display = '';
      });

      applyView();
    })();

    // Close via Back button
    detailBackBtn.addEventListener('click', closeDetail);

    // Repurpose header X: close detail if open, otherwise close drawer
    mainCloseBtn.addEventListener('click', () => {
      if (sessionDetail.classList.contains('open')) {
        closeDetail();
      } else {
        closeDrawer();
      }
    });

    // ══ PROTOTYPE EDITOR PANEL ══════════════════════════════════════════
    (function() {

      const panel        = document.getElementById('editorPanel');
      if (!panel) return; // viewer mode — no editor panel exists, skip all wiring
      const collapseBtn  = document.getElementById('editorCollapseBtn');

      // Expand / collapse — chevron toggles the panel between thin sidebar and full
      collapseBtn.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        // When collapsing, deselect any active card so card-editor mode resets
        if (panel.classList.contains('collapsed')) deselectCard();
      });

      // ── Content: event heading ───────────────────────────
      const epHeading = document.getElementById('ep-heading');
      epHeading.addEventListener('input', (e) => {
        const headerTitle = document.querySelector('.header-title');
        if (headerTitle) headerTitle.textContent = e.target.value;
      });

      // ── Content: number of days + starting date ──────────
      const epDaysSlider  = document.getElementById('ep-days');
      const epDaysVal     = document.getElementById('ep-days-val');
      const epStartDate   = document.getElementById('ep-start-date');

      function updateDateTabs() {
        const startVal = epStartDate.value; // "2026-10-28"
        const numDays  = parseInt(epDaysSlider.value, 10);
        epDaysVal.textContent = numDays;
        const tabs = document.querySelectorAll('.date-tab');
        // Parse date, avoid timezone offset by appending T12:00:00
        const start = new Date(startVal + 'T12:00:00');
        tabs.forEach((tab, i) => {
          if (i < numDays) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            tab.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            tab.style.display = '';
          } else {
            tab.style.display = 'none';
          }
        });
        // If active tab was hidden, activate first visible one
        const activeDateTab = document.querySelector('.date-tab.active');
        if (activeDateTab && activeDateTab.style.display === 'none') {
          const firstVisible = document.querySelector('.date-tab:not([style*="none"])');
          if (firstVisible) firstVisible.click();
        }
      }

      epDaysSlider.addEventListener('input', updateDateTabs);
      epDaysSlider.addEventListener('change', updateDateTabs);
      epStartDate.addEventListener('change', updateDateTabs);

      // ── Sessions: show/hide live section ─────────────────
      const epShowLive = document.getElementById('ep-show-live');
      epShowLive.addEventListener('change', (e) => {
        // The main live section (not the featured one)
        const liveSec = document.querySelector('.live-section:not(.featured-section)');
        if (liveSec) liveSec.style.display = e.target.checked ? '' : 'none';
      });

      // ── Sessions: show/hide on-demand tab ────────────────
      const epShowOnDemand = document.getElementById('ep-show-ondemand');
      epShowOnDemand.addEventListener('change', (e) => {
        const tabEl = document.getElementById('tabOnDemand');
        if (tabEl) tabEl.style.display = e.target.checked ? '' : 'none';
        // If hiding while on-demand is active, switch back to upcoming
        if (!e.target.checked && onDemandActive) setSessionTab(false);
      });

      // ── Filters: show/hide categories ────────────────────
      const FILTER_CATS = ['Channel','Type','Format','Technical level','Product','Category','Audience','Region'];
      FILTER_CATS.forEach(cat => {
        const safeId = 'ep-filter-' + cat.replace(/\s+/g, '-');
        const checkbox = document.getElementById(safeId);
        if (!checkbox) return;

        checkbox.addEventListener('change', (e) => {
          const show = e.target.checked;
          // Show/hide the sidebar pill
          document.querySelectorAll('.filter-category').forEach(pill => {
            if (pill.textContent.trim() === cat) {
              pill.style.display = show ? '' : 'none';
            }
          });
          // If hiding the currently active category, switch to first visible
          if (!show && activeCategory === cat) {
            const firstVisible = FILTER_CATS.find(c => {
              const safeId2 = 'ep-filter-' + c.replace(/\s+/g, '-');
              const el = document.getElementById(safeId2);
              return el && el.checked && c !== cat;
            });
            if (firstVisible) {
              activeCategory = firstVisible;
              renderCategory(firstVisible);
              document.querySelectorAll('.filter-category').forEach(pill => {
                pill.classList.toggle('active', pill.textContent.trim() === firstVisible);
              });
            }
          }
        });
      });

      // ── Card editor ──────────────────────────────────────
      const cardEditorEl     = document.getElementById('ep-card-editor');
      const epCardTag        = document.getElementById('ep-card-tag');
      const epCardTime       = document.getElementById('ep-card-time');
      const epCardTitle      = document.getElementById('ep-card-title');
      const epCardDesc       = document.getElementById('ep-card-desc');
      const epCardFav        = document.getElementById('ep-card-fav');
      const epCardSched      = document.getElementById('ep-card-sched');
      const epCardDeselect   = document.getElementById('epCardDeselect');
      let selectedCard       = null;

      // Sync all heart/calendar icons on a given card to match the global state Sets
      function syncCardIcons(card) {
        if (!card) return;
        const sid = card.dataset.sid;
        const isFav   = favorited.has(sid);
        const isSched = scheduled.has(sid);
        // Session-card style icons
        card.querySelectorAll('.icon-heart-sm, .icon-heart, .icon-heart-detail')
            .forEach(i => i.classList.toggle('favorited', isFav));
        card.querySelectorAll('.icon-calendar-sm, .icon-calendar-detail')
            .forEach(i => i.classList.toggle('scheduled', isSched));
        // Card-level state classes — drive the always-visible icon column
        card.classList.toggle('is-favorited', isFav);
        card.classList.toggle('is-scheduled', isSched);
        // Live-card "Favorited" button label
        const liveFavBtn = card.matches('.live-card') ? card.querySelector('.btn-secondary') : null;
        if (liveFavBtn) {
          const txt = Array.from(liveFavBtn.childNodes).find(n => n.nodeType === 3);
          if (txt) txt.textContent = isFav ? 'Favorited' : 'Favorite';
        }
      }

      function selectCard(card) {
        // Deselect previous
        if (selectedCard) selectedCard.classList.remove('ep-editing');
        selectedCard = card;
        card.classList.add('ep-editing');

        // Populate fields (live-card has different selectors)
        const isLive = card.classList.contains('live-card');
        const tag   = card.querySelector(isLive ? '.live-badge'  : '.tag-in-body');
        const time  = card.querySelector(isLive ? '.live-time'   : '.session-card-time');
        const title = card.querySelector(isLive ? '.live-title'  : '.session-card-title');
        const desc  = card.querySelector(isLive ? '.live-desc'   : '.session-card-desc');

        epCardTag.value   = tag   ? tag.textContent.trim()   : '';
        epCardTime.value  = time  ? time.textContent.trim()  : '';
        epCardTitle.value = title ? title.textContent.trim() : '';
        epCardDesc.value  = desc  ? desc.textContent.trim()  : '';

        // Sync toggle states from the global Sets
        const sid = card.dataset.sid;
        epCardFav.checked   = sid ? favorited.has(sid) : false;
        epCardSched.checked = sid ? scheduled.has(sid) : false;

        cardEditorEl.classList.add('visible');
        panel.classList.add('ep-card-mode');
        panel.scrollTop = 0;
      }

      function deselectCard() {
        if (selectedCard) selectedCard.classList.remove('ep-editing');
        selectedCard = null;
        cardEditorEl.classList.remove('visible');
        panel.classList.remove('ep-card-mode');
      }

      epCardDeselect.addEventListener('click', deselectCard);

      // Live-update card as fields change
      epCardTag.addEventListener('input', () => {
        if (!selectedCard) return;
        const isLive = selectedCard.classList.contains('live-card');
        if (isLive) {
          const el = selectedCard.querySelector('.live-badge');
          if (el) el.textContent = epCardTag.value;
        } else {
          selectedCard.querySelectorAll('.session-tag').forEach(t => setTagContent(t, epCardTag.value));
        }
      });
      epCardTime.addEventListener('input', () => {
        if (!selectedCard) return;
        const isLive = selectedCard.classList.contains('live-card');
        const el = selectedCard.querySelector(isLive ? '.live-time' : '.session-card-time');
        if (el) el.textContent = epCardTime.value;
      });
      epCardTitle.addEventListener('input', () => {
        if (!selectedCard) return;
        const isLive = selectedCard.classList.contains('live-card');
        const el = selectedCard.querySelector(isLive ? '.live-title' : '.session-card-title');
        if (el) el.textContent = epCardTitle.value;
      });
      epCardDesc.addEventListener('input', () => {
        if (!selectedCard) return;
        const isLive = selectedCard.classList.contains('live-card');
        const el = selectedCard.querySelector(isLive ? '.live-desc' : '.session-card-desc');
        if (el) el.textContent = epCardDesc.value;
      });

      // Favorite toggle
      epCardFav.addEventListener('change', () => {
        if (!selectedCard) return;
        const sid = selectedCard.dataset.sid;
        if (!sid) return;
        if (epCardFav.checked) favorited.add(sid);
        else favorited.delete(sid);
        syncCardIcons(selectedCard);
        if (typeof currentView !== 'undefined' && currentView === 'favorites' && typeof applyView === 'function') applyView();
      });

      // Schedule toggle
      epCardSched.addEventListener('change', () => {
        if (!selectedCard) return;
        const sid = selectedCard.dataset.sid;
        if (!sid) return;
        if (epCardSched.checked) {
          // Conflict check (only when adding)
          if (typeof hasScheduleConflict === 'function' && hasScheduleConflict(sid, selectedCard)) {
            showToast('Time conflict with another session', 'alert', 'alert');
            epCardSched.checked = false; // revert toggle
            return;
          }
          scheduled.add(sid);
        } else {
          scheduled.delete(sid);
        }
        syncCardIcons(selectedCard);
        if (typeof currentView !== 'undefined' && currentView === 'my' && typeof applyView === 'function') applyView();
      });

      // Intercept session card + live card clicks when panel is expanded
      document.addEventListener('click', (e) => {
        if (panel.classList.contains('collapsed')) return;
        const card = e.target.closest('.session-card, .live-card');
        if (!card) return;
        // Don't intercept clicks on action buttons
        if (e.target.closest('.card-icon-btn, .btn-primary, .btn-secondary')) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        selectCard(card);
      }, true); // capture phase so we beat the detail-panel listener

    })();
    // ══ END EDITOR PANEL ════════════════════════════════════════════════

