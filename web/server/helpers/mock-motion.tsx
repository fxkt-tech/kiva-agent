import { mock } from "node:test";
import { createElement, type ReactNode } from "react";

type MotionTestProps = Record<string, unknown> & { children?: ReactNode };

const motionProps = new Set([
  "animate", "custom", "exit", "initial", "layout", "layoutId", "transition",
  "variants", "whileFocus", "whileHover", "whileInView", "whileTap",
  "onAnimationComplete", "onAnimationStart", "onUpdate",
]);

function motionElement(tag: "div" | "span" | "svg" | "path" | "circle") {
  function MotionElement(props: MotionTestProps) {
    const hostProps = Object.fromEntries(Object.entries(props).filter(([key]) => !motionProps.has(key)));
    return createElement(tag, {
      ...hostProps,
      "data-motion-tag": tag,
      "data-motion-animate": JSON.stringify(props.animate),
      "data-motion-initial": JSON.stringify(props.initial),
      "data-motion-exit": JSON.stringify(props.exit),
      "data-motion-transition": JSON.stringify(props.transition),
    });
  }
  MotionElement.displayName = `TestMotion(${tag})`;
  return MotionElement;
}

const motion = {
  div: motionElement("div"),
  span: motionElement("span"),
  svg: motionElement("svg"),
  path: motionElement("path"),
  circle: motionElement("circle"),
};

/** Keep business tests on the real agent components without Motion's DOM engine.
 * Install before dynamically importing consumers; browser checks cover animation. */
export function installMotionMocks(options: { reducedMotion?: boolean } = {}) {
  return mock.module("motion/react", {
    namedExports: {
      motion,
      AnimatePresence: ({ children }: { children?: ReactNode }) => children,
      useReducedMotion: () => options.reducedMotion ?? false,
    },
  });
}
