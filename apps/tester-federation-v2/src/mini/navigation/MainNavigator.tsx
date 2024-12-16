import {
  type NativeStackNavigationProp,
  createNativeStackNavigator,
} from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';

import GalleryScreen from '../screens/GalleryScreen';

export type MainStackParamList = {
  Gallery: undefined;
};

export type MainStackNavigationProp =
  NativeStackNavigationProp<MainStackParamList>;

const Main = createNativeStackNavigator<MainStackParamList>();

const MainNavigator = () => {
  return (
    <Main.Navigator
      screenOptions={{
        headerTitle: 'Gallery Mini App',
        headerBackTitleVisible: true,
        headerBackTitle: 'Back',
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerTintColor: 'rgba(255,255,255,1)',
      }}
    >
      <Main.Screen name="Gallery" component={GalleryScreen} />
    </Main.Navigator>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#E68A00',
  },
  headerTitle: {
    color: '#FFFFFF',
  },
});

export default MainNavigator;
