export const META_REG = /\[\[(.*?)\]\]/g;
export const ICON_REG = /@@(.*?)@@/g;
export const SUSI_OPTIONS = {
  dctx_id: {
    stage: 'v:2,s,bg:milo,51364e80-648b-11ef-9bf6-ad6724e2c153',
    prod: 'v:2,s,bg:milo,b719a8b0-6ba6-11ef-933e-7f38920b05fd',
  },
};
export const SERIES_404_MAP_PATH = '/events/default/series-404-map.json';
export const ALLOWED_EMAIL_DOMAINS = ['@adobe.com', '@adobetest.com'];
const ENV_MAP = {
  dev: {
    name: 'dev',
    serviceApiEndpoints: {
      esl: 'https://wcms-events-service-layer-deploy-ethos102-stage-va-9c3ecd.stage.cloud.adobe.io',
      esp: 'https://wcms-events-service-platform-deploy-ethos102-stage-caff5f.stage.cloud.adobe.io',
    },
  },
  stage: {
    name: 'stage',
    serviceApiEndpoints: {
      esl: 'https://events-service-layer-stage.adobe.io',
      esp: 'https://events-service-platform-stage.adobe.io',
    },
  },
  prod: {
    name: 'prod',
    serviceApiEndpoints: {
      esl: 'https://events-service-layer.adobe.io',
      esp: 'https://events-service-platform.adobe.io',
    },
  },
  local: {
    name: 'local',
    serviceApiEndpoints: {
      esl: 'https://wcms-events-service-layer-deploy-ethos102-stage-va-9c3ecd.stage.cloud.adobe.io',
      esp: 'https://wcms-events-service-platform-deploy-ethos102-stage-caff5f.stage.cloud.adobe.io',
    },
  },
  dev02: {
    name: 'dev02',
    serviceApiEndpoints: {
      esl: 'https://wcms-events-service-layer-deploy-ethos102-stage-va-d5dc93.stage.cloud.adobe.io',
      esp: 'https://wcms-events-service-platform-deploy-ethos102-stage-c81eb6.stage.cloud.adobe.io',
    },
  },
  stage02: {
    name: 'stage02',
    serviceApiEndpoints: {
      esl: 'https://wcms-events-service-layer-deploy-ethos105-stage-or-8f7ce1.stage.cloud.adobe.io',
      esp: 'https://wcms-events-service-platform-deploy-ethos105-stage-9a5fdc.stage.cloud.adobe.io',
    },
  },
};
