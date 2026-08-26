import { useEffect, useState } from "react";

const SEARCH_DEBOUNCE_MS = 300;

interface UsePagedSearchResult {
  /** Raw input value — bind this to the search box so typing feels instant. */
  searchInput: string;
  setSearchInput: (value: string) => void;
  /** Debounced value to actually send to the server. */
  debouncedSearch: string;
  page: number;
  setPage: (page: number) => void;
}

/**
 * Page + debounced-search state for a paginated, server-searched list (see
 * GET /staff-assignments and /guide-assignments: the candidate set is every
 * rally-staff/rally-guide-scoped user ever mirrored, which is unbounded
 * over a deployment's life, so it's paginated server-side rather than
 * fetched whole).
 *
 * Debouncing avoids firing a request per keystroke. Typing also always
 * resets `page` back to 1 — a stale page number past the end of a new,
 * narrower search would just render empty.
 */
export default function usePagedSearch(): UsePagedSearchResult {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  return { searchInput, setSearchInput, debouncedSearch, page, setPage };
}
