import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Cluster,
  EmptyState,
  Field,
  Grid,
  IconButton,
  Input,
  Modal,
  Radio,
  Select,
  Skeleton,
  Spinner,
  Stack,
  Switch,
  Tabs,
  Tag,
  Textarea,
  Tooltip,
} from '@velar/ui';

/** Render a fragment and assert axe finds no accessibility violations. */
async function expectNoViolations(ui: React.ReactElement) {
  const { container } = render(ui);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
}

describe('@velar/ui primitives — accessibility (axe-core)', () => {
  it('Button — every variant/state', async () => {
    await expectNoViolations(
      <Cluster>
        <Button>Primary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="success">Success</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="warn">Warn</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
      </Cluster>,
    );
  });

  it('IconButton — labelled, with tooltip', async () => {
    await expectNoViolations(
      <Tooltip label="Launch">
        <IconButton aria-label="Launch">
          <span aria-hidden>*</span>
        </IconButton>
      </Tooltip>,
    );
  });

  it('Badge / Tag — every tone', async () => {
    await expectNoViolations(
      <Cluster>
        <Badge tone="neutral">Neutral</Badge>
        <Badge tone="primary" dot>Primary</Badge>
        <Badge tone="success" dot>Success</Badge>
        <Badge tone="warning" dot>Warning</Badge>
        <Badge tone="error" dot>Error</Badge>
        <Tag tone="info">Tag</Tag>
      </Cluster>,
    );
  });

  it('Alert — every tone', async () => {
    await expectNoViolations(
      <Stack>
        <Alert tone="info" title="Info">Message</Alert>
        <Alert tone="success" title="Done">Message</Alert>
        <Alert tone="warning" title="Careful">Message</Alert>
        <Alert tone="error" title="Error">Message</Alert>
      </Stack>,
    );
  });

  it('Feedback — Spinner, Skeleton', async () => {
    await expectNoViolations(
      <Cluster>
        <Spinner />
        <Skeleton className="h-6 w-40" />
      </Cluster>,
    );
  });

  it('Forms — Field/Input/Textarea/Select, all labelled', async () => {
    await expectNoViolations(
      <Grid>
        <Field label="Name" hint="As shown on your profile" htmlFor="ds-name">
          <Input id="ds-name" placeholder="Sofía" />
        </Field>
        <Field label="Email" error="Invalid email" htmlFor="ds-email">
          <Input id="ds-email" type="email" invalid defaultValue="bad@" />
        </Field>
        <Field label="Country" htmlFor="ds-country">
          <Select id="ds-country" defaultValue="CR">
            <option value="CR">Costa Rica</option>
            <option value="CO">Colombia</option>
          </Select>
        </Field>
        <Field label="Notes" htmlFor="ds-notes">
          <Textarea id="ds-notes" placeholder="Write here…" />
        </Field>
      </Grid>,
    );
  });

  it('Forms — Checkbox / Radio / Switch, all labelled', async () => {
    await expectNoViolations(
      <Stack>
        <Checkbox label="Accept the terms" defaultChecked />
        <Radio name="plan" label="Basic" defaultChecked />
        <Radio name="plan" label="Pro" />
        <Switch label="Notifications" defaultChecked />
      </Stack>,
    );
  });

  it('Tabs', async () => {
    await expectNoViolations(
      <Tabs
        items={[
          { id: 'a', label: 'Overview', content: <p>Overview content.</p> },
          { id: 'b', label: 'Detail', content: <p>Detail content.</p> },
        ]}
      />,
    );
  });

  it('Card — header/title/footer', async () => {
    await expectNoViolations(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
        </CardHeader>
        <p>Body</p>
        <CardFooter>
          <Button size="sm">Save</Button>
        </CardFooter>
      </Card>,
    );
  });

  it('EmptyState', async () => {
    await expectNoViolations(
      <EmptyState
        title="Nothing here yet"
        description="Data will show up here."
        action={<Button size="sm">Create the first</Button>}
      />,
    );
  });

  it('Modal — open, focus-trapped dialog', async () => {
    render(
      <Modal open onClose={() => {}} title="Example dialog" footer={<Button>OK</Button>}>
        <p>Dialog body.</p>
      </Modal>,
    );
    // Modal portals into document.body, so scan the whole document.
    const results = await axe(document.body);
    expect(results).toHaveNoViolations();
  });
});
