const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
} = require('expo/config-plugins');

const firebaseApp = require('@react-native-firebase/app/package.json');
const googleServicesVersion = firebaseApp.sdkVersions.android.gmsGoogleServicesGradle;
const googleServicesClassPath = 'com.google.gms:google-services';
const googleServicesPlugin = 'com.google.gms.google-services';

function withFirebaseAndroidOnly(config) {
  config = withProjectBuildGradle(config, (result) => {
    if (result.modResults.language !== 'groovy') {
      throw new Error('FrameCast Firebase setup requires the Android Groovy Gradle template.');
    }
    const contents = result.modResults.contents;
    if (!contents.includes(googleServicesClassPath)) {
      const dependencies = /dependencies\s*\{/;
      if (!dependencies.test(contents)) {
        throw new Error('Could not find the Android buildscript dependencies for Firebase.');
      }
      result.modResults.contents = contents.replace(
        dependencies,
        (match) => `${match}\n        classpath '${googleServicesClassPath}:${googleServicesVersion}'`,
      );
    }
    return result;
  });

  config = withAppBuildGradle(config, (result) => {
    if (result.modResults.language !== 'groovy') {
      throw new Error('FrameCast Firebase setup requires the Android Groovy Gradle template.');
    }
    const applyLine = `apply plugin: '${googleServicesPlugin}'`;
    if (!result.modResults.contents.includes(applyLine)) {
      result.modResults.contents += `\n${applyLine}\n`;
    }
    return result;
  });

  config = withAndroidManifest(config, (result) => {
    result.modResults.manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
    const application = result.modResults.manifest.application?.[0];
    if (!application) throw new Error('Could not find the Android application manifest entry.');
    application['meta-data'] ??= [];
    const metadataName = 'firebase_analytics_collection_enabled';
    const existing = application['meta-data'].find((item) => item.$?.['android:name'] === metadataName);
    const metadata = {
      $: {
        'android:name': metadataName,
        'android:value': 'false',
        'tools:replace': 'android:value',
      },
    };
    if (existing) {
      existing.$['android:value'] = 'false';
      existing.$['tools:replace'] = 'android:value';
    }
    else application['meta-data'].push(metadata);
    return result;
  });

  return withDangerousMod(config, ['android', async (result) => {
    const configuredPath = result.android?.googleServicesFile;
    if (!configuredPath) {
      throw new Error('Set expo.android.googleServicesFile to the Android Firebase configuration file.');
    }
    const source = path.resolve(result.modRequest.projectRoot, configuredPath);
    const destination = path.resolve(result.modRequest.platformProjectRoot, 'app/google-services.json');
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.promises.copyFile(source, destination);
    } catch {
      throw new Error(`Android Firebase configuration file was not found at ${source}.`);
    }
    return result;
  }]);
}

module.exports = withFirebaseAndroidOnly;
