const fs = require('node:fs/promises');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

module.exports = function withScreenAudioCapture(config) {
  return withDangerousMod(config, ['android', async result => {
    const controllerPath = path.join(
      result.modRequest.projectRoot,
      'node_modules',
      'react-native-webrtc',
      'android',
      'src',
      'main',
      'java',
      'com',
      'oney',
      'WebRTCModule',
      'ScreenCaptureController.java',
    );
    let source = await fs.readFile(controllerPath, 'utf8');
    if (!source.includes('getFrameCastMediaProjection')) {
      source = source.replace(
        'import android.view.OrientationEventListener;',
        'import android.view.OrientationEventListener;\nimport java.lang.reflect.Field;',
      );
      source = source.replace(
        'public class ScreenCaptureController extends AbstractVideoCaptureController {',
        `public class ScreenCaptureController extends AbstractVideoCaptureController {
    private static volatile ScreenCaptureController frameCastActiveController;

    public static MediaProjection getFrameCastMediaProjection() {
        ScreenCaptureController controller = frameCastActiveController;
        if (controller == null || controller.videoCapturer == null) return null;
        for (Class<?> current = controller.videoCapturer.getClass(); current != null; current = current.getSuperclass()) {
            for (Field field : current.getDeclaredFields()) {
                if (!MediaProjection.class.isAssignableFrom(field.getType())) continue;
                try {
                    field.setAccessible(true);
                    return (MediaProjection) field.get(controller.videoCapturer);
                } catch (ReflectiveOperationException | RuntimeException ignored) {
                    return null;
                }
            }
        }
        return null;
    }`,
      );
      source = source.replace(
        'this.mediaProjectionPermissionResultData = mediaProjectionPermissionResultData;',
        'this.mediaProjectionPermissionResultData = mediaProjectionPermissionResultData;\n        frameCastActiveController = this;',
      );
      source = source.replace(
        'public void dispose() {\n        MediaProjectionService.abort(context);',
        'public void dispose() {\n        if (frameCastActiveController == this) frameCastActiveController = null;\n        MediaProjectionService.abort(context);',
      );
      if (!source.includes('getFrameCastMediaProjection')) {
        throw new Error('Could not patch react-native-webrtc screen capture for FrameCast playback audio.');
      }
      await fs.writeFile(controllerPath, source);
    }
    return result;
  }]);
};
