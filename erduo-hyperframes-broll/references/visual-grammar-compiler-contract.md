# Visual Grammar Compiler contract

Status: active deterministic contract  
Runtime: `pipeline_contract_version: 2`  
Topology: `authoring_topology_id: bounded-authoring-cluster-v1`  
Schema: `references/visual-grammar-program.schema.json`  
Validator: `scripts/validate-visual-grammar-program.mjs`

## Purpose and authority

The Visual Grammar Compiler is an authoring contract plus a deterministic
validator. It turns an already authored whole-film visual direction into one
independent, structured and hash-bound `visual-grammar-program` artifact. It
does not add a producer stage. The director remains the creative producer and
freezes this artifact with the plan, design slice, display/font selection and
shared projection.

The validator has authority
`deterministic-structural-rejection-only`. It checks exact shape, identity,
hashes, projection equality, provenance bindings, cross-shot difference facts
and declared exhaustion/cooldown limits. It never invents a recipe, selects a
style, rewrites an author decision, scores visual quality or issues an
aesthetic verdict.

The program does not define Scene Kits, layer decomposition, mattes, depth
artifacts, clean plates, alpha decomposition or hero quotas. Those concepts
cannot be added through extension fields because every object is closed with
`additionalProperties: false` and the runtime validator performs matching
exact-key checks.

## Program identity and upstream bindings

One program root has:

```text
schema_version: 1
pipeline_contract_version: 2
authoring_topology_id: bounded-authoring-cluster-v1
artifact_type: visual-grammar-program
compiler_contract: scripts/validate-visual-grammar-program.mjs#schema-v1
program_id
bindings
identity / anti_identity
stable_invariants
variation_axes
exhaustion_cooldown
provenance
shot_count
pagination
pages[]
program_sha256
```

`bindings` freezes exactly:

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
```

The validator must receive the actual projection, design selection, packaged
design library and exactly one effective-base artifact: either the selected
base template or the packaged native base compiler. It revalidates the
projection, requires its receipt hash to equal `projection_sha256`, requires
its SRT and plan hashes to equal the program bindings, and requires every
recipe's millisecond and frame windows to byte-equivalent canonical values
from that projection.

The selection hash is recomputed as
`fingerprintValue(selection_without_selection_sha256)`. The effective base is
hashed with `fingerprintRenderValue`: the actual selected template in
template mode or the actual `nativeBaseCompiler` in native mode. The canonical
design library snapshot is:

```text
fingerprintRenderValue({
  policy: design_library.policy,
  source_registry: design_library.sourceRegistry,
  templates: design_library.templates sorted by template ID,
  native_base_compiler: design_library.nativeBaseCompiler,
  native_compiler_source_bundle_sha256:
    design_library.nativeBaseCompiler.native_compiler_source_bundle_sha256
})
```

The seven templates remain the complete selectable-template catalog, while
`nativeBaseCompiler` is a non-template member of the full library snapshot.
In native mode it is also independently bound by `base_template_id:
hyperframes-native` plus `base_template_sha256`. The supplied native compiler
must byte-equivalently equal `designLibrary.nativeBaseCompiler`; a hash-shaped
placeholder is not an artifact and fails.

The library adapter has exact shape
`{policy, templates, sourceRegistry, nativeBaseCompiler}`. It preserves seven
selectable templates and seven matching profiles. `hyperframes-native` may
appear in neither list, remains a built-in non-template compiler, and `draft`
cannot be enabled by the default eligible-status policy.

The selection's brief, embedded base hash and embedded library-snapshot hash
must equal the program bindings. Every selection mode also carries
`native_compiler_source_bundle_sha256`, which must equal the value recomputed
from the actual packaged native compiler. Template selections require
`visual_grammar_compilation.guard_code: BASE_TEMPLATE_BOUND`. Native
selections require:

```text
base_template: hyperframes-native
fallback: hyperframes-native
template_status: built-in
mode: native-fallback
guard_code: NATIVE_BASE_COMPILER_BOUND
```

`user-design-native-supplement` instead requires
`NATIVE_SUPPORT_ONLY_USER_LAYERS_PROTECTED` and at least one unique protected
layer from `visual_system`, `scene_grammar`, `motion_grammar` and
`compositing`. Those layer facts are covered by `selection_sha256`; native
support cannot erase or replace them. Null `base_template`,
`effective_base_template` placeholders, replayed selections and native
compiler promotion into the template catalog all fail. An outer program
re-sign cannot hide a substituted selection, effective base or library.

The native compiler's `provenance.source_refs` is an ordered, closed list of
the three approved package sources. Every record has exactly:

```text
artifact_id
relative_path
sha256
size_bytes
```

The approved artifact IDs and package-relative paths are fixed by the
validator; IDs are unique, paths cannot be absolute or traverse outside the
package, hashes are lowercase SHA-256 values and sizes are positive safe
integers. The source-bundle fingerprint is:

```text
fingerprintRenderValue({
  source_refs: native_base_compiler.provenance.source_refs
    sorted by artifact_id
})
```

It must equal the compiler's
`native_compiler_source_bundle_sha256`, the selection's same-named value and
the value embedded in the full design-library snapshot. The packaged library
must be supplied by the trusted design-library loader, which resolves only the
fixed package-relative paths and verifies each real regular file's current
byte size and SHA-256 before returning the library. Old string-only references,
a missing bundle, source drift, snapshot substitution or a re-signed
selection with invented source facts fails closed.

SRT integer milliseconds remain the only upstream timing truth. Frames are
derived only by
`absolute-ms-nearest-half-up-shared-boundary-v1`. A recipe cannot establish a
second clock or locally retime a shot.

## Identity, anti-identity and stable invariants

`identity` contains one path-free ID, one authored statement and two or more
recognizable traits. `anti_identity` contains an authored statement and two or
more rejected traits. These are creative claims by the director, not facts
generated by the validator.

`stable_invariants` covers exactly the first-principles authoring fields:

```text
surface
attention_geometry
semantic_anchor
anchor_treatment
typography
color
material_texture
motion_causality
emotional_temperature
hard_avoids[]
```

The invariant text defines relationships and obligations that survive across
shots. It is not a preset library and does not force one visual style.

## Variation and exhaustion

Each `variation_axis` owns at most one variable authoring field, records an
authored purpose and declares two to sixteen named states. A recipe selects
exactly one state for every axis in global axis order.

The global axes are also a lossless compilation of the effective base's
`adaptation_knobs`: axis IDs, order and state IDs must exactly equal the knob
IDs, order and options. No template or native-compiler knob may be omitted,
renamed, reordered or supplemented. Every recipe selects one declared state
for each resulting axis and remains subject to the same substantive
adjacent-difference and cooldown rules. For the packaged
`quiet-editorial-print` template this means all seven axes are present:
`density-tier`, `anchor-form`, `anchor-quadrant`, `type-relation`,
`accent-form`, `material-process` and `motion-cause`.

The packaged `hyperframes-native` compiler also declares seven mandatory
axes: `surface-role`, `attention-geometry`, `semantic-anchor`,
`typography-role`, `color-relation`, `native-support-role` and
`motion-cause`.

`exhaustion_cooldown` declares:

- the full-recipe comparison window, use limit and minimum return gap; and
- one ordered state cooldown record for every variation axis.

The validator only compares canonical authored values with these declared
integer limits. It rejects a conflict with
`visual_grammar_cooldown_violation`; it does not suggest or synthesize a
replacement.

## Per-shot recipe

Every projected shot has one `shot_recipe` with:

- exact `shot_id`, SRT millisecond window and projected frame window;
- one authored semantic claim;
- structured values for all ten first-principles fields;
- the selected variation states;
- exact adjacent-difference facts;
- opaque provenance reference IDs;
- `authoring_signature_sha256`; and
- `shot_recipe_sha256`.

`motion_causality` explicitly records cause, action, result and the complete
`entry → action → result → hold → exit` lifecycle. These are authoring
obligations. Static evidence and this validator cannot prove animation
quality.

`authoring_signature_sha256` is:

```text
fingerprintValue({
  surface,
  attention_geometry,
  anchor_treatment,
  typography,
  color,
  material_texture,
  motion_causality,
  emotional_temperature
})
```

It uses only substantive values from these eight positive visible design
dimensions. Opaque `decision_id`, `anchor_id`, `source_ref_ids` and
`provenance_ref_ids` are deliberately excluded. `semantic_claim`,
`semantic_anchor.claim` and `hard_avoids` remain bound by
`shot_recipe_sha256`, but changing copy or negative prohibitions alone cannot
manufacture an adjacent visual difference or evade a cooldown collision.

`shot_recipe_sha256` is `fingerprintValue(recipe_without_shot_recipe_sha256)`.
No consumer may normalize or rewrite a recipe and retain its hash.

For `S001`, `adjacent_difference` is exactly:

```json
{
  "previous_shot_id": null,
  "changed_axis_ids": [],
  "changed_authoring_fields": [],
  "content_reason": "first-shot-baseline"
}
```

For every later shot the validator recomputes the changed variation-axis
states and changed positive visible design dimensions against the immediately
preceding recipe. `changed_authoring_fields` may name only the eight dimensions
covered by `authoring_signature_sha256`. The declared ordered arrays must match
exactly, the previous shot ID must be exact and at least one positive visible
dimension must differ. This is a deterministic difference fact, not a visual
novelty verdict. The separate whole-film anti-template signature gate remains
mandatory.

## Pagination and hash chain

A recipe page contains at most eight contiguous recipes. Page numbers and
shot ordinals start at one, have no gap or overlap and cover `S001` through the
final shot.

Hash order is:

1. compute each `authoring_signature_sha256`;
2. compute each `shot_recipe_sha256`;
3. compute each `page_sha256` as
   `fingerprintValue(page_without_page_sha256)`;
4. copy exact page, shot and recipe hashes into `pagination.page_index`; and
5. compute `program_sha256` as
   `fingerprintValue(program_without_pages_and_program_sha256)`.

The root hash binds every page transitively through the ordered page index.
The embedded `pages` array is the canonical transport bundle; a private
artifact store may physically split pages as long as root and page bytes
retain these exact hashes.

## Progressive disclosure and block extraction

`extractBlockScopedRecipes()` accepts one exact chunk-plan block:

```text
block_id
shot_ids[]
start_ms / end_ms
start_frame / end_frame
namespace
```

It first validates the complete program and projection. It then requires one
contiguous range, at most eight shots and at most 45,000 ms, except that one
longer shot may be a singleton. The returned
`visual-grammar-block-recipe-packet` contains only:

- program and upstream binding hashes;
- a compact immutable `shared_visual_authoring_directive` containing the
  actual identity statement and traits, anti-identity statement and rejected
  traits, and all ten stable-invariant values;
- the exact block/window/namespace facts;
- source page hashes;
- the selected recipes and their original hashes; and
- a canonical `packet_sha256`.

The shared directive is required because a block author must internalize the
whole-film visual identity rather than work from opaque hashes. Its
`directive_sha256` is:

```text
fingerprintValue({
  identity,
  anti_identity,
  stable_invariants
})
```

The program validator returns the same `shared_directive_sha256`;
`whole_film_rules.shared_visual_grammar` binds it; and the complete directive
is also covered by `packet_sha256`. Complete page tables/indexes, unrelated
recipes and provenance source records remain omitted. A block author receives
this directive, its scoped recipes and immutable whole-film rules, not the
complete private program.

`validateVisualGrammarBlockRecipePacket()` reconstructs the expected packet
from the immutable program, projection and block scope. It verifies the
directive hash, packet hash and complete canonical packet equality. Removing
the directive or changing it and re-signing the directive/packet still fails
against the frozen program.

## Provenance and privacy

Native compiler source provenance is the package-internal structured evidence
described under upstream bindings. It is validated from the actual packaged
library before recipes are accepted and remains covered by the selection,
effective-base and full-library bindings.

`provenance.source_refs` uses opaque path-free IDs and hashes. Both
`source_ref_id` and `artifact_id` are globally unique inside the program; one
artifact cannot masquerade as multiple provenance records. The array contains
exactly one reference for each bound upstream artifact and at least one
`author-curation` reference. The ten bound source kinds are
`confirmed-brief`, `parsed-srt`, `shot-plan`, `frame-projection`,
`design-slice`, `display-selection`, `font-package`, `design-selection`,
`base-template` and `design-library-snapshot`; every source hash must equal
its corresponding program binding.

`private_inputs_exposed` is always `false`. Absolute local paths, file URIs,
host-specific locations and private author instructions are not fields in the
schema and must not appear inside allowed text values. The same sanitizer
rejects POSIX absolute paths including `/tmp`, `/Volumes` and `/opt`, home
paths, Windows drive paths, UNC shares and `file:` URIs while allowing ordinary
prose and HTTP(S) URLs. Block contexts expose the compact shared authoring
directive and scoped recipes, but provenance records remain represented only
by opaque IDs and hashes.

## Runtime inputs

The JavaScript validation, extraction and packet-validation APIs require:

```text
projection
designSelection
designLibrary
baseTemplate             # selected-template modes only
nativeBaseCompiler       # native modes only
```

Exactly one of `baseTemplate` and `nativeBaseCompiler` is accepted according
to `designSelection.base_template`. The CLI equivalents are `--projection`,
`--design-selection`, `--design-library` and exactly one of
`--base-template` or `--native-base-compiler`.

## Stable failure codes

The public deterministic codes are:

```text
visual_grammar_schema_invalid
visual_grammar_identity_invalid
visual_grammar_binding_invalid
visual_grammar_binding_mismatch
visual_grammar_projection_required
visual_grammar_projection_invalid
visual_grammar_projection_mismatch
visual_grammar_design_artifacts_required
visual_grammar_design_binding_invalid
visual_grammar_design_binding_mismatch
visual_grammar_template_axis_mismatch
visual_grammar_variation_invalid
visual_grammar_cooldown_invalid
visual_grammar_cooldown_violation
visual_grammar_provenance_invalid
visual_grammar_recipe_invalid
visual_grammar_shot_order_invalid
visual_grammar_adjacent_difference_invalid
visual_grammar_pagination_invalid
visual_grammar_page_invalid
visual_grammar_page_hash_mismatch
visual_grammar_hash_mismatch
visual_grammar_block_scope_invalid
visual_grammar_block_packet_invalid
visual_grammar_input_unreadable
```

Failures are fail-closed. Re-signing an enclosing page or root cannot waive a
projection, design, template-axis, difference, provenance or cooldown
conflict.
