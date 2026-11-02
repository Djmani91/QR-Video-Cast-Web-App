const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withMainApplication, withDangerousMod, withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withBackgroundCasting(config) {
  const appPackage = config.android?.package;
  if (!appPackage) throw new Error('FrameCast background casting requires android.package.');
  const service = `${appPackage}.casting.BackgroundCastingService`;
  config = withAppBuildGradle(config, result => {
    const dependency = 'implementation("com.google.android.gms:play-services-cast-framework:22.2.0")';
    if (!result.modResults.contents.includes(dependency)) {
      result.modResults.contents += `\ndependencies {\n    ${dependency}\n}\n`;
    }
    return result;
  });
  config = withAndroidManifest(config, result => {
    const application = result.modResults.manifest.application[0];
    // SSDP/DIAL device descriptions are served by TVs over local HTTP.
    // Android's release default blocks these requests before OkHttp connects.
    // Discovery validates the exact private peer IP and disallows redirects;
    // the FrameCast cloud API continues to use HTTPS.
    application.$['android:usesCleartextTraffic'] = 'true';
    application['meta-data'] ??= [];
    const castMetadataName = 'com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME';
    application['meta-data'] = application['meta-data'].filter(item => item.$['android:name'] !== castMetadataName);
    application['meta-data'].push({ $: {
      'android:name': castMetadataName,
      'android:value': `${appPackage}.casting.FrameCastOptionsProvider`,
    } });
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
    for (const name of ['BackgroundCastingService.kt', 'BackgroundCastingModule.kt', 'BackgroundCastingPackage.kt', 'TvDiscovery.kt', 'TvDiscoveryProtocol.kt', 'SamsungBrowserRemote.kt', 'DlnaCasting.kt', 'GoogleCasting.kt']) {
      const text = await fs.readFile(path.join(source, name), 'utf8');
      await fs.writeFile(path.join(target, name), text.replaceAll('__PACKAGE__', `${appPackage}.casting`));
    }
    return result;
  }]);
};
