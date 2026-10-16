import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Component, Suspense, type ReactNode } from "react";
import { FieldsSkeleton, PageSkeleton, RowsSkeleton } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { LoadError, LoadingLine } from "@/editors/load-state";

type Failure = { error: Error; retry: () => void };

type CatchProps = {
  resetKey: string;
  onReset: () => void;
  failed: (failure: Failure) => ReactNode;
  children: ReactNode;
};

/** Shows `failed` in place of its children after a child throws. A new `resetKey` or `retry` shows the children again. */
class Catch extends Component<CatchProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(thrown: unknown) {
    return { error: thrown instanceof Error ? thrown : new Error(String(thrown)) };
  }

  componentDidUpdate(previous: CatchProps) {
    if (this.state.error !== null && previous.resetKey !== this.props.resetKey) {
      this.retry();
    }
  }

  retry = () => {
    this.props.onReset();
    this.setState({ error: null });
  };

  render() {
    return this.state.error === null ? this.props.children : this.props.failed({ error: this.state.error, retry: this.retry });
  }
}

/** The look of the loading skeleton and of the error text: on the full screen, on a page, in the rows of a list card, in a panel, or in a dialog. */
const looks = {
  screen: {
    loading: (label: string) => <PageSkeleton label={label} className="mx-auto min-h-svh w-full max-w-3xl px-4 py-8" />,
    failed: (label: string, retry: () => void) => (
      <div className="mx-auto grid min-h-svh w-full max-w-xl content-center gap-3 px-4">
        <p role="alert">{label}</p>
        <Button type="button" onClick={retry}>
          Try again
        </Button>
      </div>
    ),
  },
  page: {
    loading: (label: string) => <PageSkeleton label={label} />,
    failed: (label: string, retry: () => void) => (
      <div className="grid content-start gap-5">
        <p role="alert">{label}</p>
        <Button type="button" onClick={retry}>
          Try again
        </Button>
      </div>
    ),
  },
  rows: {
    loading: (label: string) => <RowsSkeleton label={label} />,
    failed: (label: string, retry: () => void) => (
      <div className="grid justify-items-start gap-3 px-5 py-5">
        <p role="alert">{label}</p>
        <Button type="button" onClick={retry}>
          Try again
        </Button>
      </div>
    ),
  },
  panel: {
    loading: (label: string) => <FieldsSkeleton label={label} count={2} />,
    failed: (label: string, retry: () => void) => (
      <div className="grid gap-3">
        <p role="alert" className="text-sm">
          {label}
        </p>
        <Button type="button" onClick={retry}>
          Try again
        </Button>
      </div>
    ),
  },
  dialog: {
    loading: (label: string) => <LoadingLine label={label} />,
    failed: (label: string, retry: () => void) => <LoadError label={label} onRetry={retry} />,
  },
};

type BoundaryProps = {
  look?: keyof typeof looks;
  /** The screen reader text of the skeleton while a child loads its data. Null shows nothing: use it for a part that shows only when it has data. */
  loading: string | null;
  /** The text after a read fails, with "Try again". A function gives the text for the error, or all of the content. */
  failed: string | ((failure: Failure) => ReactNode);
  /** The content around the skeleton and the error text, when they need more. */
  frame?: (content: ReactNode) => ReactNode;
  /** A value that is not in the URL and that the children load data for. A new value shows the children again. */
  resetKey?: string;
  children: ReactNode;
};

/**
 * The place where children that read data with `useSuspenseQuery` show that they load or that a read failed.
 * "Try again" starts each failed read of the children again. A change of the URL does the same.
 */
export function Boundary({ look = "page", loading, failed, frame = (content) => content, resetKey = "", children }: BoundaryProps) {
  const href = useRouterState({ select: (state) => state.location.href });
  const shown = looks[look];
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <Catch
          resetKey={`${href} ${resetKey}`}
          onReset={reset}
          failed={(failure) => {
            const content = typeof failed === "string" ? failed : failed(failure);
            return typeof content === "string" ? frame(shown.failed(content, failure.retry)) : content;
          }}
        >
          <Suspense fallback={loading === null ? null : frame(shown.loading(loading))}>{children}</Suspense>
        </Catch>
      )}
    </QueryErrorResetBoundary>
  );
}
