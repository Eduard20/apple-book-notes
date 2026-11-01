// Text handed from "Paste from Apple Books" to the /share screen (too long for URL params).
let pasted: string | null = null;
export const setPastedText = (t: string) => void (pasted = t);
export const takePastedText = () => {
  const t = pasted;
  pasted = null;
  return t;
};
