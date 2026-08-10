# Lessons

## Etendo DB development is DB-first, then export (2026-08-07)
**Mistake:** Dispatched Task A (drop UNIQUE + add trigger in SIF modules) telling the dev to
hand-edit the model XML in `src-db/database/model/` and apply with `update.database`.
**Correct flow:** In Etendo the DB is the source of truth. Make the change **in the database**
(drop the constraint, create the trigger via SQL / AD tooling), then run `./gradlew export.database`
to regenerate the model XML. Never hand-write the XML and push it down — you export it up.
**Rule for myself:** Any DB-schema change (constraints, triggers, columns, references) → instruct
the agent to (1) apply in the live DB, (2) `export.database` to produce the XML diff, (3) verify the
XML diff matches only the intended change. Editing XML directly is the exception, not the default.

## SIF module message language is NOT uniform (2026-08-07)
**Mistake:** created the new `AEATSII_One_Active_Config` AD_MESSAGE in Spanish, copying the "sibling
convention" blindly. But the **SII module (`org.openbravo.module.sii`) authors its messages in ENGLISH**,
while TicketBAI and Verifactu are in Spanish. So the SII message was wrong-language.
**Rule for myself:** These 3 SIF localization modules do NOT share one message language — SII = English,
TBAI + VF = Spanish. Before adding any AD_MESSAGE/user-facing text to one of them, GREP its existing
sibling messages and match THAT module's language, don't assume. (Repo "all English" policy is about
code/comments/commits/docs; localized MSGTEXT follows the module's own base language.)
