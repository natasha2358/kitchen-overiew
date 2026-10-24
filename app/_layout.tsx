import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../src/shared/ui';
export default function RootLayout() { return <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }}><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></SafeAreaView>; }
