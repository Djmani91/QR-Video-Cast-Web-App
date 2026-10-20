const { withAppBuildGradle } = require('expo/config-plugins');

const uploadKeyStoreEnv = 'FRAMECAST_UPLOAD_KEYSTORE_FILE';
const uploadPasswordEnv = 'FRAMECAST_ANDROID_UPLOAD_KEY_PASSWORD';
const requireUploadSigningEnv = 'FRAMECAST_REQUIRE_UPLOAD_SIGNING';
const uploadKeyAlias = 'framecastupload';
const setupMarker = `def framecastUploadStoreFile = System.getenv('${uploadKeyStoreEnv}')`;
const signingConfigsMarker = '    signingConfigs {';
const releaseSigningMarker = `        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

module.exports = function withAndroidUploadSigning(config) {
  return withAppBuildGradle(config, result => {
    let contents = result.modResults.contents;
    if (contents.includes(setupMarker)) return result;

    if (!contents.includes(signingConfigsMarker)) {
      throw new Error('Cannot configure FrameCast Android upload signing: signingConfigs block not found.');
    }
    if (!contents.includes(releaseSigningMarker)) {
      throw new Error('Cannot configure FrameCast Android upload signing: default release signing line not found.');
    }

    const signingSetup = `    def framecastUploadStoreFile = System.getenv('${uploadKeyStoreEnv}')?.trim()
    def framecastUploadPassword = System.getenv('${uploadPasswordEnv}')
    def framecastHasUploadSigning = framecastUploadStoreFile != null || framecastUploadPassword != null
    def framecastRequiresUploadSigning = System.getenv('${requireUploadSigningEnv}') == 'true'
    if (framecastHasUploadSigning && (!framecastUploadStoreFile || !framecastUploadPassword)) {
        throw new GradleException('FrameCast upload signing requires both ${uploadKeyStoreEnv} and ${uploadPasswordEnv}.')
    }
    if (framecastRequiresUploadSigning && !framecastHasUploadSigning) {
        throw new GradleException('A Play upload requires ${uploadKeyStoreEnv} and ${uploadPasswordEnv}.')
    }
    signingConfigs {
        if (framecastHasUploadSigning) {
            release {
                storeFile file(framecastUploadStoreFile)
                storePassword framecastUploadPassword
                keyAlias '${uploadKeyAlias}'
                keyPassword framecastUploadPassword
            }
        }`;
    contents = contents.replace(signingConfigsMarker, signingSetup);
    contents = contents.replace(
      releaseSigningMarker,
      `        release {
            signingConfig framecastHasUploadSigning ? signingConfigs.release : signingConfigs.debug`,
    );

    result.modResults.contents = contents;
    return result;
  });
};
