declare module "react-native-keep-awake" {
  import React from "react";
  export default class KeepAwake extends React.Component {}
  export function activate(): void;
  export function deactivate(): void;
}
