import { AppRegistry, Platform } from 'react-native';
import { backgroundCastingTask } from './lib/background-casting';

if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask('FrameCastBackground', () => backgroundCastingTask);
}
require('expo-router/entry');
