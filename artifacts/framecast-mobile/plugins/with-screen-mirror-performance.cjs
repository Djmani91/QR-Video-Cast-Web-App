const fs = require('node:fs/promises');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

function patchScreenCaptureSource(source) {
  if (source.includes('frameCastFitDimension')) return source;
  const changes = [
    [
      'private static final int DEFAULT_FPS = 30;',
      `private static final int DEFAULT_FPS = 30;
    // Match FrameCast's transmitted 1280px long-side limit at capture time.
    // Avoid capturing a full 1440p/4K phone surface only to downscale every frame.
    private int frameCastCaptureWidth;
    private int frameCastCaptureHeight;

    private static int frameCastFitDimension(int value, int width, int height) {
        double scale = Math.min(1.0, 1280.0 / Math.max(width, height));
        return Math.max(2, ((int) Math.floor(value * scale) / 2) * 2);
    }`,
    ],
    [
      'super(width, height, DEFAULT_FPS);',
      'super(frameCastFitDimension(width, width, height), frameCastFitDimension(height, width, height), DEFAULT_FPS);',
    ],
    [
      'this.context = context;',
      `this.context = context;
        frameCastCaptureWidth = targetWidth;
        frameCastCaptureHeight = targetHeight;`,
    ],
    [
      'final int width = displayMetrics.widthPixels;\n                final int height = displayMetrics.heightPixels;',
      `final int width = frameCastFitDimension(displayMetrics.widthPixels, displayMetrics.widthPixels, displayMetrics.heightPixels);
                final int height = frameCastFitDimension(displayMetrics.heightPixels, displayMetrics.widthPixels, displayMetrics.heightPixels);`,
    ],
    [
      'videoCapturer.changeCaptureFormat(width, height, DEFAULT_FPS);',
      `// Orientation sensors fire even when the display has not rotated.
                        // Reconfiguring the virtual display repeatedly causes avoidable churn.
                        if (videoCapturer == null ||
                                (width == frameCastCaptureWidth && height == frameCastCaptureHeight)) return;
                        videoCapturer.changeCaptureFormat(width, height, DEFAULT_FPS);
                        frameCastCaptureWidth = targetWidth = actualWidth = width;
                        frameCastCaptureHeight = targetHeight = actualHeight = height;`,
    ],
  ];
  for (const [before, after] of changes) {
    if (!source.includes(before)) {
      throw new Error('The installed WebRTC screen capturer changed; review FrameCast performance patch before building.');
    }
    source = source.replace(before, after);
  }
  return source;
}

module.exports = function withScreenMirrorPerformance(config) {
  return withDangerousMod(config, ['android', async result => {
    const filename = path.join(result.modRequest.projectRoot, 'node_modules', 'react-native-webrtc',
      'android', 'src', 'main', 'java', 'com', 'oney', 'WebRTCModule', 'ScreenCaptureController.java');
    const source = await fs.readFile(filename, 'utf8');
    await fs.writeFile(filename, patchScreenCaptureSource(source));
    return result;
  }]);
};
module.exports.patchScreenCaptureSource = patchScreenCaptureSource;
