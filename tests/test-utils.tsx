import { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

interface CustomRenderOptions extends RenderOptions {
  withFlow?: boolean;
}

function AllProviders({ children, withFlow }: { children: ReactElement; withFlow?: boolean }) {
  let content = children;
  if (withFlow) content = <ReactFlowProvider>{content}</ReactFlowProvider>;
  return content;
}

export function renderWithProviders(ui: ReactElement, options?: CustomRenderOptions) {
  const { withFlow, ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders withFlow={withFlow}>
        {children as ReactElement}
      </AllProviders>
    ),
    ...renderOptions,
  });
}

export { render };
export { screen, fireEvent, waitFor, within } from '@testing-library/react';
