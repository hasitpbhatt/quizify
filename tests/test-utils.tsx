import { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';

interface CustomRenderOptions extends RenderOptions {
  withRouter?: boolean;
  withFlow?: boolean;
}

function AllProviders({ children, withRouter, withFlow }: { children: ReactElement; withRouter?: boolean; withFlow?: boolean }) {
  let content = children;
  if (withFlow) content = <ReactFlowProvider>{content}</ReactFlowProvider>;
  if (withRouter) content = <BrowserRouter>{content}</BrowserRouter>;
  return content;
}

export function renderWithProviders(ui: ReactElement, options?: CustomRenderOptions) {
  const { withRouter, withFlow, ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders withRouter={withRouter} withFlow={withFlow}>
        {children as ReactElement}
      </AllProviders>
    ),
    ...renderOptions,
  });
}

export { render };
export { screen, fireEvent, waitFor, within } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
