import {
  FrameStyle_Box,
  HorizontalSizer,
  TextAlign_Center,
  TextAlign_VertCenter,
  UndoFlag_NoSwapFile,
} from "@pixinsight/core";
import { useDialog } from "@pixinsight/react";
import {
  UIComboBox,
  UIControl,
  UIEdit,
  UIGroupBox,
  UIHorizontalSizer,
  UILabel,
  UIPushButton,
  UISlider,
  UISpinBox,
  UIStretch,
  UIToolButton,
  UIVerticalSizer,
  UIViewList,
} from "@pixinsight/ui";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { version } from "../package.json";
import { ImagePreview, ReadoutData } from "./ImagePreview";
import { ImagePreviewSelect } from "./ImagePreviewSelect";
import { NumericControl } from "./NumericControl";
import { binarize } from "./process/binarize";
import { convolute } from "./process/convolute";
import { dilation } from "./process/dilation";
import { assignThroughMask, substract } from "./process/pixelMath";
import { structures } from "./process/structures";

export const SCRIPT_NAME = "Star De-emphasizer";
const SCRIPT_DESCRIPTION = `<b> ${SCRIPT_NAME}  v${version}</b> &mdash; This script uses the method suggested by Adam Block to de-emphasize stars.<br><br>Copyright (c) 2021 Maxim Valenko @AstroSwell`;

export const defaultParameters = {
  structuresMinLayer: 1,
  structuresMaxLayer: 3,
  binarizeThreshold: 0.2,
  dilationSize: 5,
  convolutionSize: 9,
};

type Parameters = typeof defaultParameters;

type Step =
  | "original"
  | "starless"
  | "luminance"
  | "structures"
  | "binarized"
  | "dilated"
  | "convoluted"
  | "halos"
  | "result";

const stepMap: Record<Step, Step> = {
  original: "starless",
  starless: "original",
  luminance: "original",
  structures: "luminance",
  binarized: "structures",
  dilated: "binarized",
  convoluted: "dilated",
  halos: "convoluted",
  result: "original",
};

export function ScriptDialog({
  parameters: storedParameters,
  onParameterChange,
}: {
  parameters?: Partial<Parameters>;
  onParameterChange?: <K extends keyof Parameters>(
    name: K,
    value: Parameters[K]
  ) => void;
}) {
  const dialog = useDialog();

  const [starlessView, setStarlessView] = useState<View | null>(null);
  const [targetView, setTargetView] = useState<View | null>(null);
  const [rect, setRect] = useState<Rect>(new Rect());
  const [readout, setReadout] = useState("");

  const [previewImages, setPreviewImages] = useState(
    {} as { [key in Step]?: Image }
  );

  const [currentStep, setCurrentStep] = useState<Step>("original");
  const [previousStep, setPreviousStep] = useState<Step>("original");

  const [isEnabledControls, setIsEnabledControls] = useState(true);

  const [parameters, setParameters] = useState({
    ...defaultParameters,
    ...storedParameters,
  });

  const targetImage = useMemo(() => targetView?.image, [targetView]);
  const starlessImage = useMemo(() => starlessView?.image, [starlessView]);
  const currentImage = useMemo(() => previewImages[currentStep], [
    currentStep,
    previewImages,
  ]);

  useEffect(() => {
    let original = previewImages.original;
    if (targetImage) {
      const previewImage = new Image();
      previewImage.assign(targetImage);
      previewImage.cropTo(rect);
      original = previewImage;
      setPreviewImages({
        original,
        starless: previewImages.starless,
      });
      setCurrentStep("original");
    }

    if (starlessImage) {
      const previewStarlessImage = new Image();
      previewStarlessImage.assign(starlessImage);
      previewStarlessImage.cropTo(rect);
      setPreviewImages({
        original,
        starless: previewStarlessImage,
      });
    }
  }, [rect, targetImage, starlessImage]);

  function updateStructuresSettings(updatedParameters: Partial<Parameters>) {
    if (updatedParameters.structuresMinLayer) {
      if (
        updatedParameters.structuresMinLayer > parameters.structuresMaxLayer
      ) {
        updatedParameters.structuresMaxLayer =
          updatedParameters.structuresMinLayer;
      }
    }
    const newParameters = { ...parameters, ...updatedParameters };
    setParameters(newParameters);
    onParameterChange?.("structuresMinLayer", newParameters.structuresMinLayer);
    onParameterChange?.("structuresMaxLayer", newParameters.structuresMaxLayer);
  }

  function process(image: Image, starlessImage: Image) {
    const lumImage = new Image();

    console.log("Get Luminance...");
    image.getLuminance(lumImage);

    console.log("MultiscaleLinearTransform...");
    const structuresImage = structures(lumImage, {
      minLayer: parameters.structuresMinLayer,
      maxLayer: parameters.structuresMaxLayer,
    });

    console.log("Binarize...");
    const binarizedImage = binarize(structuresImage, {
      threshold: parameters.binarizeThreshold,
    });

    console.log("MorphologicalTransformation Dilation...");
    const dilatedImage = dilation(binarizedImage, parameters.dilationSize);

    console.log("Convolution...");
    const convolutedImage = convolute(dilatedImage, parameters.convolutionSize);

    console.log("Calculate halos mask...");
    const halosImage = substract(convolutedImage, lumImage);

    console.log("Render result image...");
    const finalImage = assignThroughMask(image, starlessImage, halosImage);

    return {
      lumImage,
      structuresImage,
      binarizedImage,
      dilatedImage,
      convolutedImage,
      halosImage,
      finalImage,
    };
  }

  function onProcessPreviewClick() {
    if (!previewImages.original || !previewImages.starless) {
      return;
    }

    setIsEnabledControls(false);

    try {
      const {
        lumImage,
        structuresImage,
        binarizedImage,
        dilatedImage,
        convolutedImage,
        halosImage,
        finalImage,
      } = process(previewImages.original, previewImages.starless);

      setPreviewImages({
        ...previewImages,
        luminance: lumImage,
        structures: structuresImage,
        binarized: binarizedImage,
        dilated: dilatedImage,
        convoluted: convolutedImage,
        halos: halosImage,
        result: finalImage,
      });
      if (currentStep === "original" || currentStep === "starless") {
        setCurrentStep("result");
      }
    } catch (error) {
      console.error(error);
    }

    setIsEnabledControls(true);
  }

  function onApplyClick() {
    if (!targetImage || !starlessImage) {
      return;
    }

    setIsEnabledControls(false);

    try {
      const { finalImage } = process(targetImage, starlessImage);

      targetView?.beginProcess();
      targetView?.image.apply(finalImage);
      targetView?.endProcess();

      const msg = new MessageBox(
        "Stars are successfully de-empasized",
        "Success"
      );
      msg.execute();
    } catch (error) {
      console.error(error);
    }

    setIsEnabledControls(true);
  }

  function onResetClick() {
    setParameters(defaultParameters);
  }

  function onNewInstancePress() {
    dialog.newInstance();
  }

  function onMainViewMousePress() {
    const newStep = stepMap[currentStep];
    setPreviousStep(currentStep);
    setCurrentStep(newStep);
  }

  function onMainViewMouseRelease() {
    setCurrentStep(previousStep);
  }

  function onMainViewReadout([x, y, count, c0, c1, c2]: ReadoutData) {
    let readout = `X: ${x} Y: ${y}`;
    if (count === 1 && c0 != null) {
      readout += ` K: ${c0.toFixed(4)}`;
    } else {
      readout += ` R: ${c0.toFixed(4)} G: ${c1.toFixed(4)} B: ${c2.toFixed(4)}`;
    }
    setReadout(readout);
  }

  return (
    <UIVerticalSizer>
      <UIHorizontalSizer>
        <UIVerticalSizer margin={5} spacing={5}>
          <UILabel
            text={SCRIPT_DESCRIPTION}
            frameStyle={FrameStyle_Box}
            minHeight={70}
            maxHeight={70}
            wordWrapping={true}
            useRichText={true}
            stretchFactor={0}
          />

          <UIHorizontalSizer>
            <UILabel
              text="Target view: "
              textAlignment={TextAlign_VertCenter}
              minWidth={80}
            />
            <UIViewList
              onViewSelected={(view: View) => {
                setTargetView(view.isNull ? null : view);
              }}
              stretchFactor={1}
            />
          </UIHorizontalSizer>

          <UIHorizontalSizer>
            <UILabel
              text="Starless view: "
              textAlignment={TextAlign_VertCenter}
              minWidth={80}
            />
            <UIViewList
              onViewSelected={(view: View) =>
                setStarlessView(view.isNull ? null : view)
              }
              enabled={Boolean(targetView && !targetView.isNull)}
              stretchFactor={1}
            />
          </UIHorizontalSizer>

          <UIGroupBox title="Structures" spacing={5} margin={5}>
            <UIHorizontalSizer>
              <UILabel
                minWidth={60}
                text="Min layer:"
                textAlignment={TextAlign_VertCenter}
              />
              <UISpinBox
                minWidth={70}
                minValue={1}
                maxValue={10}
                value={parameters.structuresMinLayer}
                onValueUpdated={(structuresMinLayer) =>
                  updateStructuresSettings({
                    structuresMinLayer,
                  })
                }
              />
              <UIStretch />
            </UIHorizontalSizer>
            <UIHorizontalSizer>
              <UILabel
                minWidth={60}
                text="Max layer:"
                textAlignment={TextAlign_VertCenter}
              />
              <UISpinBox
                minWidth={70}
                maxValue={10}
                value={parameters.structuresMaxLayer}
                minValue={parameters.structuresMinLayer}
                onValueUpdated={(structuresMaxLayer) =>
                  updateStructuresSettings({
                    structuresMaxLayer,
                  })
                }
              />
              <UIStretch />
            </UIHorizontalSizer>
          </UIGroupBox>

          <UIGroupBox title="Binarization" spacing={5} margin={5}>
            <UIHorizontalSizer spacing={5}>
              <UILabel text="Threshold: " textAlignment={TextAlign_Center} />
              <NumericControl
                value={parameters.binarizeThreshold}
                onValueUpdated={(binarizeThreshold) => {
                  setParameters({ ...parameters, binarizeThreshold });
                  onParameterChange?.("binarizeThreshold", binarizeThreshold);
                }}
                minValue={0}
                maxValue={1}
                stepSize={0.01}
                tickInterval={0.01}
              />
            </UIHorizontalSizer>
          </UIGroupBox>

          <UIGroupBox title="Dilation" spacing={5} margin={5}>
            <UIHorizontalSizer spacing={5}>
              <UILabel text="Size: " textAlignment={TextAlign_Center} />
              <UISpinBox
                minValue={3}
                maxValue={11}
                stepSize={2}
                value={parameters.dilationSize}
                onValueUpdated={(dilationSize) => {
                  setParameters({ ...parameters, dilationSize });
                  onParameterChange?.("dilationSize", dilationSize);
                }}
              />
              <UIStretch />
            </UIHorizontalSizer>
          </UIGroupBox>

          <UIGroupBox title="Convolution" spacing={5} margin={5}>
            <UIHorizontalSizer spacing={5}>
              <UILabel text="Size: " textAlignment={TextAlign_Center} />
              <UISpinBox
                minValue={3}
                maxValue={61}
                stepSize={2}
                value={parameters.convolutionSize}
                onValueUpdated={(convolutionSize) => {
                  setParameters({ ...parameters, convolutionSize });
                  onParameterChange?.("convolutionSize", convolutionSize);
                }}
              />
              <UIStretch />
            </UIHorizontalSizer>
          </UIGroupBox>

          <UIGroupBox title="Select preview area" spacing={5} margin={5}>
            <ImagePreviewSelect
              image={targetImage}
              minWidth={300}
              minHeight={200}
              onRect={(rect) => setRect(rect)}
            />
          </UIGroupBox>

          <UIPushButton
            text="Process Preview"
            onClick={onProcessPreviewClick}
            enabled={Boolean(targetImage && starlessImage) && isEnabledControls}
          />

          <UIStretch />
        </UIVerticalSizer>

        <UIVerticalSizer margin={5} spacing={5} stretchFactor={100}>
          <UIControl>
            <UIHorizontalSizer spacing={5}>
              <ImagePreview
                image={previewImages.original}
                title="Original"
                active={currentStep === "original"}
                onMousePress={() =>
                  previewImages.original && setCurrentStep("original")
                }
              />
              <ImagePreview
                image={previewImages.starless}
                title="Starless"
                active={currentStep === "starless"}
                onMousePress={() =>
                  previewImages.starless && setCurrentStep("starless")
                }
              />
              <ImagePreview
                image={previewImages.luminance}
                title="Luminance"
                active={currentStep === "luminance"}
                onMousePress={() =>
                  previewImages.luminance && setCurrentStep("luminance")
                }
              />
              <ImagePreview
                image={previewImages.structures}
                title="Structure"
                active={currentStep === "structures"}
                onMousePress={() =>
                  previewImages.structures && setCurrentStep("structures")
                }
              />
              <ImagePreview
                image={previewImages.binarized}
                title="Binarized"
                active={currentStep === "binarized"}
                onMousePress={() =>
                  previewImages.binarized && setCurrentStep("binarized")
                }
                // onMouseDoubleClick={() => {
                //   const iw = new ImageWindow(
                //     previewImages.binarized?.width,
                //     previewImages.binarized?.width,
                //     previewImages.binarized?.numberOfChannels
                //   );
                //   iw.mainView.beginProcess();
                //   iw.mainView.image.assign(previewImages.binarized);
                //   iw.mainView.endProcess();
                // }}
              />
              <ImagePreview
                image={previewImages.dilated}
                title="Dilated"
                active={currentStep === "dilated"}
                onMousePress={() =>
                  previewImages.dilated && setCurrentStep("dilated")
                }
              />
              <ImagePreview
                image={previewImages.convoluted}
                title="Convoluted"
                active={currentStep === "convoluted"}
                onMousePress={() =>
                  previewImages.convoluted && setCurrentStep("convoluted")
                }
              />
              <ImagePreview
                image={previewImages.halos}
                title="Halos mask"
                active={currentStep === "halos"}
                onMousePress={() =>
                  previewImages.halos && setCurrentStep("halos")
                }
              />
              <ImagePreview
                image={previewImages.result}
                title="Result"
                active={currentStep === "result"}
                onMousePress={() =>
                  previewImages.result && setCurrentStep("result")
                }
              />
            </UIHorizontalSizer>
          </UIControl>

          <ImagePreview
            stretchFactor={1}
            image={currentImage}
            toolTip="Press the mouse to compare with original"
            onReadout={onMainViewReadout}
            onMousePress={onMainViewMousePress}
            onMouseRelease={onMainViewMouseRelease}
          />
          <UILabel text={readout} />
        </UIVerticalSizer>
      </UIHorizontalSizer>

      <UIHorizontalSizer spacing={5} margin={5}>
        <UIToolButton
          icon=":/process-interface/new-instance.png"
          onMousePress={onNewInstancePress}
        />
        <UIStretch />
        <UIPushButton
          onClick={onResetClick}
          icon=":/icons/reload.png"
          text="Reset"
          enabled={isEnabledControls}
        />
        <UIPushButton
          onClick={onApplyClick}
          icon=":/icons/ok.png"
          text="Apply"
          enabled={isEnabledControls}
        />
      </UIHorizontalSizer>
    </UIVerticalSizer>
  );
}
