/// <reference types="vite/client" />

declare interface Window {
  transformersPipeline: any;
  transformersEnv: any;
  transformersReady: boolean | undefined;
}
