# Lab Test Results Reports — Reference

Generated from the Lab Management System codebase. Use this file to understand what appears on printable reports for each test.

## Report types

| Report | Route | Description |
|--------|-------|-------------|
| Unified order report | /order-report/:orderId | All tests on one lab order |
| Single test report | /test-report/:distributionId | One distribution / specialized result |
| Concrete cube report | /concrete-report/:distributionId | Dedicated cube layout (legacy path) |
| Batch report | /batch-report/:batchId | Multiple samples in one batch |
| Reception receipt | /print-receipt/:sampleId | At registration (not final results) |

## Common metadata (order / sample information table)

- orderCode
- sampleCode
- inspectionReference
- contractNumber
- contractName (project name)
- contractorName
- sampleType (material category)
- location
- sector
- receivedAt
- reportDate
- castingDate
- supplier/source (from notes)
- optional reception entry data fields
- notes (free text)
- technician name
- manager reviewer
- QC reviewer
- overall pass/fail

## Optional reception entry data (stored in sample notes as JSON)

- **CONC_CUBE**: Sample for, Mix ratio, Cement type, Max aggregate size, Time, Slump (inches), Cubes/cylinders reference, Camp name
- **CONC_CORE**: Sample for, Mix ratio, Cement type, Max aggregate size, Time, Slump (inches), Cubes/cylinders reference, Camp name
- **CONC_BEAM**: Sample for, Mix ratio, Cement type, Max aggregate size, Time, Slump (inches), Cubes/cylinders reference, Camp name
- **CONC_FOAM**: Sample for, Mix ratio, Cement type, Max aggregate size, Time, Slump (inches), Cubes/cylinders reference, Camp name
- **CONC_INTERLOCK**: F. level, Facility, Sample description
- **CONC_BLOCK**: Facility, F. level, Description of work
- **SOIL_SIEVE**: Facility, F. level, Full description, Material for
- **SOIL_ATTERBERG**: Material description, Source of material, Material for
- **SOIL_PROCTOR**: Material description, Source of material, Material for
- **SOIL_CBR**: Material description, Source of material, Material for
- **SOIL_FIELD_DENSITY**: Sample description, Source, Layer
- **STEEL_REBAR**: Sample description, Site, Source
- **STEEL_STRUCTURAL**: Sample description, Site, Source
- **STEEL_ANCHOR**: Sample description, Site, Source
- **STEEL_BEND**: Sample description, Site, Source
- **ASPH_HOTBIN**: Source of aggregate, Site, Size of aggregate
- **ASPH_BITUMEN_EXTRACT**: Source of aggregate, Site, Size of aggregate
- **ASPH_EXTRACTED_SIEVE**: Source of aggregate, Site, Size of aggregate
- **ASPH_MARSHALL**: Sample location, Material, Source, Plant name, Station, Sample no., Agg. source
- **ASPH_MARSHALL_DENSITY**: Sample location, Material, Source, Plant name, Station, Sample no., Agg. source
- **ASPH_CORE**: Date sampled, Sample location, Material, Layer, Date laid, Sample no.
- **AGG_SG**: Description, Material for, Source, Aggregate size, Site
- **AGG_FLAKINESS_ELONGATION**: Description, Material for, Source, Aggregate size, Site
- **AGG_CRUSHING**: Description, Material for, Source, Aggregate size, Site
- **AGG_IMPACT**: Description, Material for, Source, Aggregate size, Site
- **AGG_LA**: Description, Material for, Source, Aggregate size, Site

## All tests — catalog and report fields

### CONC_CUBE — Compressive Strength of Concrete Cubes

- **Arabic name**: قوة ضغط مكعبات الخرسانة
- **Category**: concrete
- **Form template**: concrete_cubes
- **Standard**: BS EN 12390-3
- **Result unit**: N/mm²
- **Price (AED)**: 15
- **Report route**: /concrete-report/:distributionId (also legacy test-report)

**Summary / info fields on report:**
- castingDate
- sampleAgeDays
- nominalCubeSize
- specifiedStrength
- requiredAtAge
- structureType
- classOfConcrete
- maxAggSize
- placeOfSampling
- curingCondition
- batchReference
- avgStrength

**Results table columns:**
- cubeNo
- location
- cubeSize
- maxLoad
- area
- cubeStrength
- correctedStrength
- result

---

### CONC_CORE — Compressive Strength of Concrete Cores

- **Arabic name**: قوة ضغط نواة خرسانية
- **Category**: concrete
- **Form template**: concrete_cores
- **Standard**: BS EN 12504-1
- **Result unit**: N/mm²
- **Price (AED)**: 20
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- specifiedCubeStrength
- required
- avgEquivalentCubeStrength
- endCondition
- coreType
- castDate
- ageDays
- coringDate
- cementType
- aggregateType

**Results table columns:**
- coreNo
- ageDays
- diameter
- length
- weightInAir
- weightInAirSSD
- weightInWater
- density
- ld
- correctionFactor
- maxLoad
- coreStrength
- equivalentCubeStrength
- result

---

### CONC_BLOCK — Compressive Strength of Masonry Blocks

- **Arabic name**: قوة ضغط بلوك خرساني
- **Category**: concrete
- **Form template**: concrete_blocks
- **Standard**: BS EN 771-3
- **Result unit**: N/mm²
- **Price (AED)**: 30
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- blockType
- blockSpec.size
- blockSpec.standard
- requiredStrength
- avgStrength
- count

**Results table columns:**
- blockNo
- widthMm
- heightMm
- lengthMm
- weightKg
- maxLoad
- strengthMpa
- correctedStrength
- result

---

### CONC_INTERLOCK — Compressive Strength of Interlocking Tiles

- **Arabic name**: قوة ضغط بلاط انترلوك
- **Category**: concrete
- **Form template**: interlock
- **Standard**: BS EN 1338
- **Result unit**: N/mm²
- **Price (AED)**: 20
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- tileType
- size
- requiredStrength
- avgStrength

**Results table columns:**
- specimenNo
- maxLoad
- strength
- result

---

### CONC_FOAM — Compressive Strength / Density of Lightweight Foam Concrete Cubes

- **Arabic name**: مقاومة الضغط / كثافة مكعبات الخرسانة الرغوية خفيفة الوزن
- **Category**: concrete
- **Form template**: concrete_foam
- **Standard**: BS 1881-116 / BS 1881-114
- **Result unit**: kg/cm²
- **Price (AED)**: 15
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- concreteAge
- requiredStrength
- avgStrength
- avgDensity

**Results table columns:**
- cubeNo
- maxLoad
- strength
- density
- result

---

### CEM_SETTING_TIME — Initial Setting Time of Cement

- **Arabic name**: زمن التصلب الابتدائي للأسمنت
- **Category**: concrete
- **Form template**: cement_setting_time
- **Standard**: ASTM C191 / BS EN 196-3
- **Result unit**: min
- **Price (AED)**: 100
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- initialSettingTime
- finalSettingTime
- requiredInitial
- result

**Results table columns:**
- reading
- timeMin
- notes

---

### CONC_BEAM — Flexural Strength of Concrete Beams

- **Arabic name**: مقاومة الانحناء لعوارض الخرسانة
- **Category**: concrete
- **Form template**: concrete_beam
- **Standard**: ASTM C78
- **Result unit**: MPa
- **Price (AED)**: 80
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- castDate
- ageDays
- span
- requiredFlexural
- avgStrength

**Results table columns:**
- beamNo
- width
- depth
- span
- maxLoad
- modulusOfRupture
- result

---

### CONC_MIX_GRAD — Mix Aggregate Gradation

- **Arabic name**: تدرج ركام الخلطة
- **Category**: concrete
- **Form template**: concrete_mix_grad
- **Standard**: ASTM C33 / BS EN 12620
- **Result unit**: %
- **Price (AED)**: 65
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- blendStandard
- overallResult

**Results table columns:**
- sieveSize
- percentPassing
- specMin
- specMax
- result

---

### STEEL_REBAR — Tensile Strength of Reinforcement Steel

- **Arabic name**: قوة شد حديد التسليح
- **Category**: steel
- **Form template**: steel_rebar
- **Standard**: BS 4449
- **Result unit**: N/mm²
- **Price (AED)**: 300
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- barSize
- grade
- standard

**Results table columns:**
- diameter
- weightPerMeter
- yieldLoadKN
- yieldStrength
- utsLoadKN
- uts
- elongation
- bendResult
- overallResult

---

### STEEL_BEND — Bend Test

- **Arabic name**: اختبار ثني قضبان حديد التسليح
- **Category**: steel
- **Form template**: steel_bend_rebend
- **Standard**: BS 4449
- **Result unit**: —
- **Price (AED)**: 100
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- barSize
- bendDiameter
- result

**Results table columns:**
- specimenNo
- diameter
- bendResult
- rebendResult
- overallResult

---

### STEEL_ANCHOR — Tensile Strength of Anchor Bolts

- **Arabic name**: قوة شد برغي تثبيت
- **Category**: steel
- **Form template**: steel_anchor_bolt
- **Standard**: BS EN ISO 898-1
- **Result unit**: kN
- **Price (AED)**: 300
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- boltType
- grade

**Results table columns:**
- specimenNumber
- trials
- nominalSize
- cutSectionDiameter
- cutSectionArea
- loadKN
- tensileStrengthMPa
- glMm
- elongation
- reductionOfArea
- grade
- overallResult

---

### STEEL_STRUCTURAL — Tensile Strength of Structural Steel

- **Arabic name**: قوة شد حديد إنشائي
- **Category**: steel
- **Form template**: steel_structural
- **Standard**: BS EN 10025
- **Result unit**: N/mm²
- **Price (AED)**: 300
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- grade
- sectionType

**Results table columns:**
- sectionType
- width
- thickness
- area
- yieldLoad
- maxLoad
- yieldStrength
- tensileStrength
- elongation
- overallResult

---

### SOIL_SIEVE — Sieve Analysis

- **Arabic name**: تحليل المناخل
- **Category**: soil
- **Form template**: sieve_analysis
- **Standard**: BS 1377 / BS EN 933-1
- **Result unit**: %
- **Price (AED)**: 100
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- sieveStandard
- overallResult
- failedSieves

**Results table columns:**
- sieveSize
- percentRetained
- percentPassing
- specLimit

---

### SOIL_ATTERBERG — Atterberg Limits (Plasticity Index)

- **Arabic name**: حدود أتربرج
- **Category**: soil
- **Form template**: soil_atterberg
- **Standard**: BS 1377-2
- **Result unit**: %
- **Price (AED)**: 150
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- liquidLimit
- plasticLimit
- plasticityIndex
- overallResult

**Results table columns:**
- trial
- waterContent
- blows
- liquidLimit
- plasticLimit
- plasticityIndex

---

### SOIL_PROCTOR — MDD/OMC (Proctor) Test

- **Arabic name**: اختبار بروكتور
- **Category**: soil
- **Form template**: soil_proctor
- **Standard**: BS 1377-4
- **Result unit**: kN/m³
- **Price (AED)**: 300
- **Reception sub-types**: BS_HEAVY, BS_LIGHT, MODIFIED_PROCTOR
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- mdd
- omc
- testMethod
- cbrStandard

**Results table columns:**
- point
- mouldSoil
- mouldWeight
- soilWeight
- wetDensity
- waterContent
- dryDensity

---

### SOIL_CBR — California Bearing Ratio (CBR)

- **Arabic name**: نسبة تحمل كاليفورنيا
- **Category**: soil
- **Form template**: soil_cbr
- **Standard**: BS 1377-4 / ASTM D1883
- **Result unit**: %
- **Price (AED)**: 250
- **Reception sub-types**: BS_1377_4, ASTM_D1883
- **Requires completed tests first**: SOIL_PROCTOR
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- mdd
- omc
- cbrAt95Mdd
- cbrAt98Mdd
- cbrAt100Mdd
- retained20mm
- finalCBR
- cbrMin
- standard

**Results table columns:**
- penetrationMm
- loadKN
- stressKPa
- cbrPercent

---

### SOIL_FIELD_DENSITY — Field Density (Compaction Test)

- **Arabic name**: كثافة حقلية
- **Category**: soil
- **Form template**: soil_field_density
- **Standard**: BS 1377-9
- **Result unit**: Mg/m³
- **Price (AED)**: 100
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- mdd
- omc
- requiredCompaction
- avgCompaction
- overallResult

**Results table columns:**
- location
- wetDensity
- dryDensity
- moistureContent
- compactionPercent
- result

---

### ASPH_HOTBIN — Asphalt Trial Mix & Hotbin Aggregates

- **Arabic name**: تدرج الخلاط الساخن
- **Category**: asphalt
- **Form template**: asphalt_hotbin
- **Standard**: —
- **Result unit**: %
- **Price (AED)**: 50
- **Reception sub-types**: wearing_course, base_course
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- course
- overallResult

**Results table columns:**
- sieveSize
- percentPassing
- specMin
- specMax

---

### ASPH_BITUMEN_EXTRACT — Bitumen Extraction

- **Arabic name**: استخلاص البيتومين
- **Category**: asphalt
- **Form template**: asphalt_bitumen_extraction
- **Standard**: ASTM D2172
- **Result unit**: %
- **Price (AED)**: 200
- **Reception sub-types**: wearing_course, base_course
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- bitumenContent
- course

**Results table columns:**
- trial
- panWeight
- panMixWeight
- filterWeight
- filterMixWeight
- bitumenPercent

---

### ASPH_EXTRACTED_SIEVE — Sieve Analysis of Extracted Aggregates

- **Arabic name**: مناخل الركام المستخلص
- **Category**: asphalt
- **Form template**: asphalt_extracted_sieve
- **Standard**: —
- **Result unit**: %
- **Price (AED)**: 100
- **Reception sub-types**: wearing_course, base_course
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- course
- overallResult

**Results table columns:**
- sieveSize
- percentRetained
- percentPassing
- specLimit

---

### ASPH_MARSHALL_DENSITY — Bulk Specific Gravity of Compacted HMA (ASTM D 2726)

- **Arabic name**: الثقل النوعي الظاهري للخلطة الإسفلتية المدموكة (ASTM D 2726)
- **Category**: asphalt
- **Form template**: asphalt_marshall_density
- **Standard**: ASTM D 2726
- **Result unit**: g/cm³
- **Price (AED)**: 75
- **Reception sub-types**: wearing_course, base_course
- **Requires completed tests first**: ASPH_BITUMEN_EXTRACT
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- avgBulkDensity
- avgAirVoids
- course

**Results table columns:**
- specimenNo
- weightAir
- weightWater
- weightSSD
- volume
- bulkDensity
- airVoids

---

### ASPH_MARSHALL — HMA Marshall Stability and Flow (ASTM D 6927)

- **Arabic name**: الثبات والتدفق لخلطة HMA (ASTM D 6927)
- **Category**: asphalt
- **Form template**: asphalt_marshall
- **Standard**: ASTM D 6927
- **Result unit**: kN
- **Price (AED)**: 100
- **Reception sub-types**: wearing_course, base_course
- **Requires completed tests first**: ASPH_MARSHALL_DENSITY
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- avgStability
- avgFlow
- course

**Results table columns:**
- specimenNo
- stability
- flow
- bulkDensity
- airVoids
- result

---

### ASPH_CORE — HMA Pavement Thickness, Bulk Specific Gravity and Compaction Test (ASTM D 3549, D 2726)

- **Arabic name**: اختبار سماكة الرصف HMA والثقل النوعي الظاهري ونسبة الدمك (ASTM D 3549, D 2726)
- **Category**: asphalt
- **Form template**: asphalt_core
- **Standard**: ASTM D3549 / ASTM D2726 / BS EN 12697-36
- **Result unit**: %
- **Price (AED)**: 75
- **Reception sub-types**: wearing_course, base_course
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- avgThickness
- avgBulkDensity
- avgCompaction
- coreCount

**Results table columns:**
- coreNo
- thickness
- bulkDensity
- maxDensity
- compactionPercent
- result

---

### ASPH_SPRAY_RATE — Spray Rate

- **Arabic name**: معدل الرش
- **Category**: asphalt
- **Form template**: asphalt_spray_rate
- **Standard**: —
- **Result unit**: L/m²
- **Price (AED)**: 50
- **Reception sub-types**: wearing_course, base_course
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- requiredSprayRate
- avgSprayRate
- overallResult

**Results table columns:**
- location
- area
- bitumenUsed
- sprayRate
- result

---

### AGG_SG — Relative density and water absorption of coarse & fine aggregate

- **Arabic name**: الكثافة النسبية وامتصاص الماء للركام الخشن والناعم
- **Category**: aggregates
- **Form template**: agg_specific_gravity
- **Standard**: BS 812-2 / ASTM C127 / C128
- **Result unit**: —
- **Price (AED)**: 75
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- aggType
- avgApparentSg
- avgAbsorption

**Results table columns:**
- fraction
- sampleWeightSSD
- sampleWeightOven
- sampleWeightWater
- apparentSg
- absorption

---

### AGG_FLAKINESS_ELONGATION — Flakiness & Elongation Index

- **Arabic name**: معامل التقشر والاستطالة
- **Category**: aggregates
- **Form template**: agg_shape_index
- **Standard**: BS EN 933-3 / BS EN 933-4
- **Result unit**: %
- **Price (AED)**: 100
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- flakinessIndex
- elongationIndex
- overallResult

**Results table columns:**
- sieveFraction
- flakiness
- elongation

---

### AGG_CRUSHING — Aggregate Crushing Value (ACV)

- **Arabic name**: قيمة سحق الركام (ACV)
- **Category**: aggregates
- **Form template**: acv
- **Standard**: BS 812-110
- **Result unit**: %
- **Price (AED)**: 100
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- acv
- requiredMax
- overallResult

**Results table columns:**
- trial
- massFraction
- load
- acvPercent
- result

---

### AGG_IMPACT — Aggregate Impact Value (AIV)

- **Arabic name**: قيمة تأثير الركام (AIV)
- **Category**: aggregates
- **Form template**: aiv
- **Standard**: BS 812-112
- **Result unit**: %
- **Price (AED)**: 100
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- aiv
- requiredMax
- overallResult

**Results table columns:**
- trial
- massFraction
- load
- aivPercent
- result

---

### AGG_LA — Los Angeles Abrasion Test

- **Arabic name**: تآكل لوس أنجلوس
- **Category**: aggregates
- **Form template**: agg_la_abrasion
- **Standard**: BS EN 1097-2
- **Result unit**: %
- **Price (AED)**: 150
- **Report route**: /test-report/:distributionId

**Summary / info fields on report:**
- laLoss
- requiredMaxLoss
- overallResult

**Results table columns:**
- charge
- initialWeight
- finalWeight
- lossPercent
- result

---

