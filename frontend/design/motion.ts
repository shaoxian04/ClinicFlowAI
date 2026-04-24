import type { Variants } from "framer-motion";

export const countUp = {
  stiffness: 120,
  damping: 20,
  mass: 1,
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
};

export const staggerChildren: Variants = {
  animate: {
    transition: { staggerChildren: 0.07 },
  },
};

export const revealEditorial: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4 },
  },
};

export const slideInRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3 },
  },
};

export const stampSettle: Variants = {
  initial: {
    opacity: 0,
    scale: 1.3,
    rotate: 18,
  },
  animate: {
    opacity: 0.95,
    scale: 1,
    rotate: -2,
    transition: {
      type: "spring",
      stiffness: 180,
      damping: 14,
      mass: 0.8,
      duration: 0.6,
    },
  },
};
