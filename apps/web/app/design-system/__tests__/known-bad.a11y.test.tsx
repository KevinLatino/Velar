import { render } from '@testing-library/react';
import { axe } from 'jest-axe';

/**
 * Proof that the accessibility gate actually bites (issue #75): a deliberately
 * inaccessible fragment MUST produce axe violations. If axe ever stopped
 * catching these, this test fails — so the gate can't silently rot.
 */
describe('accessibility gate — known-bad example', () => {
  it('flags a button with no accessible name and an image with no alt', async () => {
    const { container } = render(
      <div>
        <button type="button" />
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src="/x.png" />
      </div>,
    );

    const results = await axe(container);
    expect(results.violations.length).toBeGreaterThan(0);
    const ids = results.violations.map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining(['button-name', 'image-alt']));
  });

  it('confirms the same markup, fixed, passes', async () => {
    const { container } = render(
      <div>
        <button type="button">Save</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/x.png" alt="Example" />
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
