# Whole-film rules contract

Status: active immutable contract  
Runtime: `pipeline_contract_version: 2`  
Topology: `authoring_topology_id: bounded-authoring-cluster-v1`  
Schema: `references/whole-film-rules.schema.json`  
Validator: `scripts/validate-whole-film-rules.mjs`

## Purpose and ownership

`whole_film_rules` is one real schema-validated, hash-bound object frozen by
the director and shared unchanged by every block author. It is not descriptive
prose and it is not a new producer stage.

The object binds all authoring blocks to one brief/SRT/plan/projection/design/
display/font/visual-grammar chain and one set of asset-route, delivery-profile,
namespace, seam and anti-template policies. A block may receive a scoped
authoring context derived from it, but no block may mutate, reinterpret or
replace the global object.

The validator has only
`deterministic-structural-rejection-only` authority. A creative author remains
required. No deterministic pass is an aesthetic, animation or delivery
approval.

## Exact root

The closed root is:

```text
schema_version: 1
pipeline_contract_version: 2
authoring_topology_id: bounded-authoring-cluster-v1
artifact_type: whole-film-rules
rules_contract: scripts/validate-whole-film-rules.mjs#schema-v1
rules_id
bindings
timing_truth
shared_visual_grammar
asset_route_policy
delivery_profile
namespace_policy
seam_policy
anti_template_policy
distribution_policy
authoring_authority
whole_film_rules_sha256
```

Unknown fields fail. No Scene Kit, layer decomposition, matte, depth, clean
plate, alpha decomposition or hero-quota object exists in the schema.

`whole_film_rules_sha256` is
`fingerprintValue(rules_without_whole_film_rules_sha256)`. The hash therefore
binds every policy byte and every upstream hash.

## Binding ledger

`bindings` requires exactly:

```text
confirmed_brief_sha256
parsed_srt_sha256
shot_plan_sha256
projection_sha256
design_slice_sha256
display_selection_sha256
font_package_sha256
design_selection_sha256
base_template_id
base_template_sha256
design_library_snapshot_sha256
visual_grammar_program_sha256
asset_route_policy_sha256
delivery_profile_sha256
namespace_policy_sha256
seam_policy_sha256
anti_template_policy_sha256
```

Validation requires the actual visual grammar program, shared projection,
design selection, packaged design library and exactly one actual effective
base: the selected template or the packaged `hyperframes-native` native
compiler. The validator reruns the visual-grammar validator, matches all
eleven common upstream bindings, and requires the program hash to equal both
`bindings.visual_grammar_program_sha256` and
`shared_visual_grammar.program_sha256`. This transitively proves the selected
template or native-compiler bytes, the canonical full-library snapshot, the
native compiler source-bundle fingerprint, the selection
mode/guard/protected-layer facts and the exact compiled adaptation axes.

The full-library snapshot covers the policy, source registry, seven sorted
selectable templates, packaged native compiler and
`native_compiler_source_bundle_sha256`. The visual-grammar validator requires
that source-bundle fingerprint in every selection mode, recomputes it from the
native compiler's structured source records, and returns it in its receipt;
the whole-film receipt surfaces the same value. Those records use the exact
closed shape
`{artifact_id, relative_path, sha256, size_bytes}`. The packaged library must
come from the trusted design-library loader, which verifies each allowed
package-relative file's actual byte size and SHA-256 before selection. Old
string references, a missing bundle, a substituted snapshot, native source
drift or a merely re-signed selection therefore fail upstream validation.

When a caller supplies `expectedBindings`, it must contain the complete
seventeen-field ledger and every value must match. A partial expected map cannot
silently weaken the gate.

The five policy hashes are independently recomputed with `fingerprintValue`:

```text
asset_route_policy_sha256 = fingerprintValue(asset_route_policy)
delivery_profile_sha256 = fingerprintValue(delivery_profile)
namespace_policy_sha256 = fingerprintValue(namespace_policy)
seam_policy_sha256 = fingerprintValue(seam_policy)
anti_template_policy_sha256 = fingerprintValue(anti_template_policy)
```

Renewing the outer rules hash cannot hide a changed policy whose binding hash
was not also intentionally updated, and updating a binding invalidates all
downstream blocks.

## Timing truth

`timing_truth` is fixed to:

- integer SRT milliseconds as the only upstream time truth;
- the bound shared projection as the only frame derivation;
- `scripts/compile-frame-projection.mjs#schema-v1`;
- `absolute-ms-nearest-half-up-shared-boundary-v1`;
- the exact bound `projection_sha256`; and
- no local retiming.

Every block window and recipe must equal the projection. Neither a block
author nor an integrator can create a local clock, round boundaries
independently or repair timing by moving a seam.

## Shared visual grammar

`shared_visual_grammar` binds:

- the program ID and root hash;
- separate hashes of identity, anti-identity, stable invariants, variation
  axes and exhaustion/cooldown;
- `shared_directive_sha256`, computed over the actual identity,
  anti-identity and ten stable-invariant values delivered to every block;
- `visual-grammar-block-recipe-packet#schema-v1`; and
- mandatory preservation of recipe hashes.

These hashes are recomputed from the actual validated visual grammar program.
This lets every block prove it uses one common whole-film grammar while
receiving only its own recipes.

## Frozen policies

### Asset route

The only route order is:

```text
user-media → image-generation → pexels → native-auxiliary
```

An ordinary primary material is required. Native output is auxiliary only and
cannot be the primary material.

### Delivery profile

The profile freezes one path-free profile ID, positive target width/height,
one reduced rational FPS pair, codec and an explicit audio policy. The
validator does not silently normalize FPS or substitute a codec.

### Namespace

All blocks share global selector uniqueness. Block namespaces match
`^b[0-9]{3}$`, DOM IDs use
`{block_namespace}--{shot_id}--{local_id}`, cross-block duplicate IDs are
forbidden and a block author cannot write outside its allocation.

### Seams

The lifecycle order is exactly
`entry → action → result → hold → exit`. Timeline gap and overlap are both
zero. Each entry accepts the preceding exit and each exit hands attention to
the following entry. Chunk-plan seam obligations are mandatory and the
integrator cannot repair a block seam by changing block bytes.

Seam nullability is bound to the actual validated program extent, not merely
to a block's own claims. Only a scope beginning at the true first program shot
may have `preceding_seam.neighbor_block_id: null`, and that block must be
`B001`. `B001` cannot begin after the true first shot. Only a scope ending at
the true final program shot may have
`following_seam.neighbor_block_id: null`; a mid-film block cannot claim no
successor, and the final scope cannot claim a following block.

### Anti-template

Per-recipe adjacent-difference facts and visual-grammar cooldown enforcement
are mandatory. Adjacent/cooldown credit requires a change in at least one
positive visible design dimension; changed claim copy, semantic-anchor copy,
opaque IDs or `hard_avoids` alone do not count. The independent whole-film
signature gate remains
`scripts/validate-anti-template-signatures.mjs#schema-v1`. Only explicitly
content-driven exceptions are eligible under that gate, and no deterministic
gate may issue an aesthetic verdict.

### Authoring authority

`creative_author_required` is true. Both
`validator_may_generate_recipe` and
`validator_may_issue_aesthetic_verdict` are false. These constants prevent
schema validation from becoming a hidden creative author.

## Progressive disclosure

The full visual grammar program remains in the private artifact store.
`distribution_policy` requires:

- progressive disclosure;
- only a block recipe packet for a block author;
- at most eight shots and 45,000 ms per normal block;
- the existing one-long-shot singleton exception; and
- no private location or private author-instruction exposure.

`extractWholeFilmBlockContext()` validates the complete rules, program and
projection before returning one
`whole-film-block-authoring-context`. The input block binds:

```text
block_id
shot_ids[]
start_ms / end_ms
start_frame / end_frame
namespace
preceding_seam
following_seam
```

The context contains the immutable rules hash and binding ledger, global
timing/policy objects, explicit neighbor seam obligations and one scoped
visual-grammar recipe packet. That packet includes the actual compact shared
visual authoring directive: identity statement/traits, anti-identity
statement/rejected traits and all ten stable-invariant values. It does not
contain the complete program, page table/index, unrelated recipes, provenance
records, private paths or private author instructions.

The returned `context_sha256` is
`fingerprintValue(context_without_context_sha256)`. Context extraction cannot
change any recipe bytes or global policy.

`validateWholeFilmBlockContext()` reconstructs the expected context from the
immutable rules, visual grammar program, projection, design selection,
packaged design library, actual effective base and block scope. It requires
exact canonical equality in addition to `context_sha256`. Removing or changing
the directive and re-signing every nested and outer hash therefore still fails
against
`whole_film_rules.shared_visual_grammar` and the frozen program.

The same path sanitizer used by the visual-grammar validator applies to
whole-film text: POSIX absolute paths, home paths, Windows drive paths, UNC
shares and `file:` URIs are rejected, while ordinary prose and HTTP(S) URLs
remain valid.

## Runtime inputs

The JavaScript whole-film validation, extraction and context-validation APIs
require:

```text
visualGrammarProgram
projection
designSelection
designLibrary
baseTemplate             # selected-template modes only
nativeBaseCompiler       # native modes only
```

Exactly one effective-base input is accepted according to
`designSelection.base_template`. The CLI equivalents are
`--visual-grammar-program`, `--projection`, `--design-selection`,
`--design-library` and exactly one of `--base-template` or
`--native-base-compiler`.

## Stable failure codes

The public deterministic codes are:

```text
whole_film_rules_schema_invalid
whole_film_rules_identity_invalid
whole_film_rules_binding_invalid
whole_film_rules_binding_mismatch
whole_film_rules_upstream_required
whole_film_rules_visual_grammar_invalid
whole_film_rules_timing_invalid
whole_film_rules_policy_invalid
whole_film_rules_policy_hash_mismatch
whole_film_rules_hash_mismatch
whole_film_rules_block_scope_invalid
whole_film_rules_block_context_invalid
whole_film_rules_input_unreadable
```

All failures are fail-closed. The rules validator may explain which frozen
fact conflicts, but it cannot modify a program, policy, recipe, block or seam
to make the run pass.
