// Text measurement utility for consistent sizing
export const measureText = (
  text: string,
  fontSize: number,
  fontWeight: string = "500",
  fontFamily: string = "system-ui, sans-serif"
) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  return {
    width: metrics.width,
    height: fontSize, // Approximate height - could use actualBoundingBoxAscent + actualBoundingBoxDescent for precision
    actualHeight:
      (metrics.actualBoundingBoxAscent || fontSize * 0.8) +
      (metrics.actualBoundingBoxDescent || fontSize * 0.2)
  };
};