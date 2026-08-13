declare module "*.svg" {
  import React from "react";
  import { SvgProps } from "react-native-svg";
  const content: React.FC<SvgProps>;
  export default content;
}

declare module "*.wav" {
  const resource: number;
  export default resource;
}

declare module "*.mp3" {
  const resource: number;
  export default resource;
}

declare module "*.ogg" {
  const resource: number;
  export default resource;
}
