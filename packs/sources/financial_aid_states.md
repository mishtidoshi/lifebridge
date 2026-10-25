# State aid in `financial_aid.json`: sources and what still needs checking

Checked 2026-10-12. Every state step and deadline has `source_url` and `last_verified` in the pack.

## Sources

| What | Source |
|---|---|
| Every state's deadline and program names (the text in each state step's "What the official source says") | The official **2027–28 FAFSA form**, "2027–28 FAFSA Deadlines" (pages 1–2): https://studentaid.gov/sites/default/files/2027-28-fafsa-form.pdf |
| Federal deadline: "We must receive your application no later than June 30, 2028." | Same PDF, page 1 |
| What the FAFSA covers (grants, work-study, loans) and the DACA rule | Same PDF ("What is the FAFSA Form?" and the notes for question 13) |
| Each state's aid agency and website | NASSGAP state grant agency directory, https://www.nassgap.org/advocacy-news-history/links-and-resources/ (each link was opened and updated where it had moved) |
| State applications for students who can't file the FAFSA | Each state agency's own page (linked in the pack) |

## State applications for students who can't file the FAFSA

Included (13 states + California's CA Dream Act):

| State | Application | Official wording in the pack? |
|---|---|---|
| CA | California Dream Act Application | yes (FAFSA PDF + csac.ca.gov) |
| TX | TASFA | yes (highered.texas.gov) |
| WA | WASFA | yes (wsac.wa.gov) |
| OR | ORSAA | yes (oregonstudentaid.gov) |
| CO | CASFA | yes (cdhe.colorado.gov) |
| NJ | NJ Alternative Financial Aid Application | yes (hesaa.org) |
| NY | NYS DREAM Act application | yes (hesc.ny.gov) |
| MD | MHEC One App | yes (mhec.maryland.gov) |
| VA | Virginia Alternative State Aid Application | yes (FAFSA PDF) |
| MA | MASFA | yes (mass.edu) |
| NM | Alternative applications through colleges | yes (hed.nm.gov) |
| **IL** | Alternative Application for Illinois Financial Aid | **no: page blocks automated reading. Copy the wording by hand.** |
| **MN** | Minnesota Alternative State Financial Aid Application | **no: page blocks automated reading. Copy the wording by hand.** |

**Left out on purpose:** Connecticut (AACTUS is used by public colleges, but the state's official page doesn't describe it; undocumented CT students get the general "aid without the FAFSA" step instead).

## Check by hand before submitting

1. **Illinois and Minnesota:** open the two pages above in a browser, copy one sentence each into `source_text`, and set `last_verified`.
2. **Illinois:** ISAC says a July 2026 federal court ruling ended ISAC aid for undocumented students for 2026–27, and the 2027–28 Alternative Application has new rules. Re-read ISAC's page before the demo.
3. **Rules for undocumented students are changing in several states in 2026** (for example, court cases about in-state tuition). The pack tells students to confirm eligibility, but re-check the 13 applications above close to submission.
4. **Program names** come only from the FAFSA PDF. For states the PDF only says "check with your financial aid office," the pack names the agency but no program, on purpose.
5. Ask the counselor to skim your own state's step and the CA steps.
