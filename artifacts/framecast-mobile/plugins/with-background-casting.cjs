const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withMainApplication, withDangerousMod } = require('expo/config-plugins');

module.exports = function withBackgroundCasting(config) {
  const appPackage = config.android?.package;
  if (!appPackage) throw new Error('FrameCast background casting requires android.package.');
  const service = `${appPackage}.casting.BackgroundCastingService`;
  config = withAndroidManifest(config, result => {
    const application = result.modResults.manifest.application[0];
    application.service ??= [];
    if (!application.service.some(item => item.$['android:name'] === service)) {
      application.service.push({ $: {
        'android:name': service,
        'android:exported': 'false',
        'android:stopWithTask': 'false',
        'android:foregroundServiceType': 'connectedDevice',
      } });
    }
    return result;
  });
  config = withMainApplication(config, result => {
    const registration = `add(${appPackage}.casting.BackgroundCastingPackage())`;
    if (!result.modResults.contents.includes(registration)) {
      const marker = 'PackageList(this).packages.apply {';
      if (!result.modResults.contents.includes(marker)) {
        throw new Error('Cannot register FrameCast background native module in this Android template.');
      }
      result.modResults.contents = result.modResults.contents.replace(marker, `${marker}\n              ${registration}`);
    }
    const enableMediaProjectionService =
      'com.oney.WebRTCModule.WebRTCModuleOptions.getInstance().enableMediaProjectionService = true';
    if (!result.modResults.contents.includes(enableMediaProjectionService)) {
      const marker = 'super.onCreate()';
      if (!result.modResults.contents.includes(marker)) {
        throw new Error('Cannot enable the WebRTC media projection service in this Android template.');
      }
      result.modResults.contents = result.modResults.contents.replace(
        marker,
        `${marker}\n    ${enableMediaProjectionService}`,
      );
    }
    return result;
  });
  return withDangerousMod(config, ['android', async result => {
    const source = path.join(result.modRequest.projectRoot, 'native', 'android');
    const target = path.join(result.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', ...appPackage.split('.'), 'casting');
    await fs.mkdir(target, { recursive: true });
    for (const name of ['BackgroundCastingService.kt', 'BackgroundCastingModule.kt', 'BackgroundCastingPackage.kt', 'TvDiscovery.kt', 'TvDiscoveryProtocol.kt', 'SamsungBrowserRemote.kt']) {
      const text = await fs.readFile(path.join(source, name), 'utf8');
      await fs.writeFile(path.join(target, name), text.replaceAll('__PACKAGE__', `${appPackage}.casting`));
    }
    return result;
  }]);
};
