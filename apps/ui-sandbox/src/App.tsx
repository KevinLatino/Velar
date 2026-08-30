import {
  ThemeProvider,
  ThemeSwitcher,
  Stack,
  Cluster,
  Card,
  CardHeader,
  CardTitle,
  CardFooter,
  Button,
  Badge,
  Alert,
  Field,
  Input,
  Tabs,
  type TabItem,
} from '@velar/ui';

/**
 * Second, real consumer of @velar/ui (issue #76). Everything below is imported
 * purely through the published `@velar/ui` entry point — no cross-app imports
 * into apps/web. If the package's build/exports break, this app fails to build.
 */
const tabs: TabItem[] = [
  {
    id: 'primitives',
    label: 'Primitives',
    content: (
      <Stack>
        <Cluster>
          <Button variant="primary">Primary</Button>
          <Button variant="success">Success</Button>
          <Button variant="ghost">Ghost</Button>
        </Cluster>
        <Cluster>
          <Badge tone="success">active</Badge>
          <Badge tone="warning" dot>
            pending
          </Badge>
          <Badge tone="neutral">draft</Badge>
        </Cluster>
      </Stack>
    ),
  },
  {
    id: 'forms',
    label: 'Forms',
    content: (
      <Field label="Bond ID">
        <Input placeholder="BOND-2026-001" />
      </Field>
    ),
  },
  {
    id: 'feedback',
    label: 'Feedback',
    content: (
      <Alert tone="info" title="Reusable outside apps/web">
        This sandbox renders @velar/ui straight from its published exports.
      </Alert>
    ),
  },
];

export function App() {
  return (
    <ThemeProvider>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
        <Cluster>
          <h1 style={{ flex: 1, fontWeight: 700 }}>@velar/ui sandbox</h1>
          <ThemeSwitcher />
        </Cluster>
        <Card>
          <CardHeader>
            <CardTitle>Component showcase</CardTitle>
          </CardHeader>
          <Tabs items={tabs} />
          <CardFooter>
            <Button variant="primary" size="sm">
              Done
            </Button>
          </CardFooter>
        </Card>
      </main>
    </ThemeProvider>
  );
}

export default App;
