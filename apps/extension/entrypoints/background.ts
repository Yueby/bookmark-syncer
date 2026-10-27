import { defineBackground } from "wxt/utils/define-background";
import { initBackground } from "@bookmark-syncer/app/src/background";

export default defineBackground({
  type: "module",
  main: initBackground,
});
