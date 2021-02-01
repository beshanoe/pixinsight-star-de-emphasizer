import {
  Align_Center,
  FrameStyle_Box,
  FrameStyle_Styled,
  TextAlign_Center,
} from "@pixinsight/core";
import { UIControl, UIFrame, UILabel, UIVerticalSizer } from "@pixinsight/ui";
import React, { useMemo, useRef, useState } from "react";

export type ReadoutData = [
  x: number,
  y: number,
  channelsCount: number,
  c0: number,
  c1: number,
  c2: number
];

export function ImagePreview({
  image,
  title,
  active,
  children,
  onReadout,
  ...props
}: {
  image?: Image;
  title?: string;
  active?: boolean;
  onReadout?: (data: ReadoutData) => void;
} & React.ComponentProps<typeof UIFrame>) {
  const controlRef = useRef<Control>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const [bmp, offsetX, offsetY, channelsCount] = useMemo(() => {
    const ratio = image?.width / image?.height;
    const [sw, sh] = [size.w, size.h];

    let width, height;
    const controlRatio = sw / sh;
    if (controlRatio >= 1) {
      const eh =
        image?.height / sh > 1
          ? Math.round(image?.height / sh)
          : 1 / Math.round(sh / image?.height);
      height = image?.height / eh;
      width = height * ratio;
    } else {
      const ew =
        image?.width / sw > 1
          ? Math.round(image?.width / sw)
          : 1 / Math.round(sw / image?.width);
      width = image?.width / ew;
      height = width / ratio;
    }

    const bmp = image?.render().scaledTo(width, height, 0);
    return [
      bmp,
      size.w / 2 - bmp?.width / 2,
      size.h / 2 - bmp?.height / 2,
      image?.numberOfChannels,
    ];
  }, [image, size]);

  function onPaint() {
    if (!controlRef.current || !bmp) {
      return;
    }
    const control = controlRef.current;
    const G = new Graphics(control);

    G.drawBitmap(offsetX, offsetY, bmp);
    G.end();

    gc();
  }

  function onResize(w: number, h: number) {
    setSize({ w, h });
  }

  function onMouseMove(x: number, y: number) {
    if (!onReadout) {
      return;
    }
    const [rx, ry] = [
      Math.round(((x - offsetX) * image?.width) / bmp?.width),
      Math.round(((y - offsetY) * image?.height) / bmp?.height),
    ];
    if (rx < 0 || ry < 0 || rx > image?.width || ry > image?.height) {
      return;
    }

    const rect = new Rect(rx, ry, rx + 1, ry + 1);
    const result: ReadoutData = [rx, ry, channelsCount, 0, 0, 0];
    for (let c = 0; c < channelsCount; c++) {
      const pixels: number[] = [];
      image?.getSamples(pixels, rect, c);
      result[c + 3] = pixels[0];
    }
    onReadout(result);
  }

  return (
    <UIVerticalSizer>
      {title &&
        (active ? (
          <UIControl
            onPaint={function (this: Control) {
              const g = new Graphics(this);
              g.brush = new Brush(0xff00ff00);
              g.fillRect(0, 0, this.width, this.height);
              g.end();
            }}
          >
            <UILabel textAlignment={TextAlign_Center} text={title} />
          </UIControl>
        ) : (
          <UILabel textAlignment={TextAlign_Center} text={title} />
        ))}
      <UIFrame
        frameStyle={FrameStyle_Box}
        minWidth={100}
        minHeight={100}
        {...props}
      >
        {
          image ? (
            <UIControl
              ref={controlRef}
              onPaint={onPaint}
              onResize={onResize}
              onMouseMove={onMouseMove}
              mouseTracking={true}
            >
              {children}
            </UIControl>
          ) : null
          // <UILabel alignment={Align_Center} text={title} />
        }
      </UIFrame>
    </UIVerticalSizer>
  );
}
