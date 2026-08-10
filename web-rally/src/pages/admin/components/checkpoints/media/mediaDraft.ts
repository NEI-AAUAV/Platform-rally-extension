/** Shared draft shape for the "add media" form — one flat object regardless
 * of which kind is selected, so switching kinds in the selector doesn't lose
 * whatever the admin already typed into an unrelated field. */
export interface MediaDraft {
  caption: string;
  title: string;
  contentUrl: string;
  contentText: string;
  image: File | null;
}

export const EMPTY_DRAFT: MediaDraft = {
  caption: "",
  title: "",
  contentUrl: "",
  contentText: "",
  image: null,
};

export type MediaDraftPatch = Partial<MediaDraft>;
