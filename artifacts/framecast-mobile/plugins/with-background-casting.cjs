const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withMainApplication, withDangerousMod, withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withBackgroundCasting(config) {
  const appPackage = config.android?.package;
  if (!appPackage) throw new Error('FrameCast background casting requires android.package.');
  const service = `${appPackage}.casting.BackgroundCastingService`;
  config = withAppBuildGradle(config, result => {
    const dependencies = [
      'implementation("com.google.android.gms:play-services-cast-framework:22.2.0")',
      "implementation files('libs/AmazonFling.jar', 'libs/WhisperPlay.jar')",
    ];
    const missing = dependencies.filter(dependency => !result.modResults.contents.includes(dependency));
    if (missing.length) {
      result.modResults.contents += `\ndependencies {\n${missing.map(dependency => `    ${dependency}`).join('\n')}\n}\n`;
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
    for (const name of ['BackgroundCastingService.kt', 'BackgroundCastingModule.kt', 'BackgroundCastingPackage.kt', 'TvDiscovery.kt', 'TvDiscoveryProtocol.kt', 'SamsungBrowserRemote.kt', 'DlnaCasting.kt', 'GoogleCasting.kt', 'AmazonFlingCasting.kt']) {
      const text = await fs.readFile(path.join(source, name), 'utf8');
      await fs.writeFile(path.join(target, name), text.replaceAll('__PACKAGE__', `${appPackage}.casting`));
    }
    const libsSource = path.join(source, 'libs');
    const libsTarget = path.join(result.modRequest.platformProjectRoot, 'app', 'libs');
    await fs.mkdir(libsTarget, { recursive: true });
    for (const name of ['AmazonFling.jar', 'WhisperPlay.jar']) {
      await fs.copyFile(path.join(libsSource, name), path.join(libsTarget, name));
    }
    const noticesTarget = path.join(result.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'third-party-licenses');
    await fs.mkdir(noticesTarget, { recursive: true });
    for (const name of ['AMAZON_FLING_LICENSE.txt', 'AMAZON_FLING_NOTICES.txt']) {
      await fs.copyFile(path.join(libsSource, name), path.join(noticesTarget, name));
    }
    return result;
  }]);
};
