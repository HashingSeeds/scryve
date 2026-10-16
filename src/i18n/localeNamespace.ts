// why: plural suffixes differ per locale, so generated files cannot share the English type.
export type LocaleNamespace = { readonly [key: string]: string | LocaleNamespace }
