import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Document HTML racine (web).
 *
 * On déclare `lang="fr"` + `notranslate` pour empêcher la traduction automatique
 * du navigateur (ex. Chrome / Google sur Android), qui détectait mal la langue et
 * « re-traduisait » le français en français, produisant des libellés erronés
 * (« Réserver » → « Commandant », « Enregistrer » → « Économiser »).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr" translate="no">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="google" content="notranslate" />
        <ScrollViewStyleReset />
      </head>
      <body className="notranslate">{children}</body>
    </html>
  );
}
