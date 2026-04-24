 import './global.css';

import {
  ImageBackground,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import heroTelkomBg from './assets/hero-telkom-bg.jpg';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#1565C0" />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-neutral-dark">
      <View
        className="bg-trust px-4 pb-3"
        style={{ paddingTop: Math.max(insets.top, 12) }}>
        <Text className="text-lg font-semibold text-white">RapidReach</Text>
        <Text className="text-sm text-white/80">Dispatcher-ready · emergency response</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4 pb-8"
        showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={heroTelkomBg}
          className="overflow-hidden rounded-xl"
          imageStyle={styles.heroImage}
          resizeMode="cover">
          <View className="bg-neutral-dark/75 px-4 py-6">
            <Text className="text-base font-semibold text-white">Telkom hero</Text>
            <Text className="mt-1 text-sm text-white/85">
              Same asset as the native splash screen; use for marketing or map-style headers.
            </Text>
          </View>
        </ImageBackground>

        <Pressable className="items-center justify-center rounded-2xl bg-emergency py-4 active:opacity-90">
          <Text className="text-lg font-bold text-white">SOS · Emergency</Text>
        </Pressable>

        <View className="gap-2 rounded-xl bg-neutral-card p-4">
          <Text className="text-sm font-medium text-content-secondary">Design tokens (NativeWind)</Text>
          <View className="flex-row flex-wrap gap-2">
            <Swatch label="Emergency" className="bg-emergency" />
            <Swatch label="Trust" className="bg-trust" />
            <Swatch label="Success" className="bg-success" />
            <Swatch label="Warning" className="bg-warning" />
          </View>
        </View>

        <View className="rounded-xl bg-surface-light p-4">
          <Text className="text-content-primary">Primary text on light surface (#212121)</Text>
          <Text className="mt-2 text-content-secondary">Secondary text for hints (#616161)</Text>
        </View>

        <View className="flex-row items-center gap-2 rounded-lg bg-success/20 px-3 py-2">
          <View className="h-2 w-2 rounded-full bg-success" />
          <Text className="text-sm text-white">Safe state · e.g. ambulance arrived</Text>
        </View>

        <View className="flex-row items-center gap-2 rounded-lg bg-warning/20 px-3 py-2">
          <View className="h-2 w-2 rounded-full bg-warning" />
          <Text className="text-sm text-white">Warning · pending or weak signal</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heroImage: {
    borderRadius: 12,
  },
});

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`h-8 w-8 rounded-md ${className}`} />
      <Text className="text-xs text-white/90">{label}</Text>
    </View>
  );
}

export default App;
