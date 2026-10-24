import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { sections } from '../../src/shared/navigation';
import { colors } from '../../src/shared/ui';
export default function TabLayout() {
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green, tabBarStyle: { height: 72, paddingBottom: 12, paddingTop: 8 }, sceneStyle: { backgroundColor: colors.cream } }}>{sections.map(section => <Tabs.Screen key={section.route} name={section.route} options={{ title: section.title, tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>{section.symbol}</Text> }} />)}</Tabs>;
}
