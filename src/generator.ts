import type { GeneratorOptions } from "@prisma/generator-helper";
import { generatorHandler } from "@prisma/generator-helper";
import path from "path";

import { GENERATOR_NAME } from "~/constants";
import { generateDatabaseType } from "~/helpers/generateDatabaseType";
import { generateFiles } from "~/helpers/generateFiles";
import { generateImplicitManyToManyModels } from "~/helpers/generateImplicitManyToManyModels";
import { generateModel } from "~/helpers/generateModel";
import { sorted } from "~/utils/sorted";
import { validateConfig } from "~/utils/validateConfig";
import { writeFileSafely } from "~/utils/writeFileSafely";

import { type EnumType, generateEnumType } from "./helpers/generateEnumType";
import {
  convertToMultiSchemaModels,
  parseMultiSchemaMap,
} from "./helpers/multiSchemaHelpers";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require("../package.json");

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "./generated",
      prettyName: GENERATOR_NAME,
    };
  },
  onGenerate: async (options: GeneratorOptions) => {
    // Parse the config
    const config = validateConfig({
      ...options.generator.config,
      databaseProvider: options.datasources[0].provider,
    });

    // Generate enum types
    let enums = options.dmmf.datamodel.enums
      .map(({ name, values }) => generateEnumType(name, values))
      .filter((e): e is EnumType => !!e);

    // Generate DMMF models for implicit many to many tables
    //
    // (I don't know why you would want to use implicit tables
    // with kysely, but hey, you do you)
    const implicitManyToManyModels = generateImplicitManyToManyModels(
      options.dmmf.datamodel.models
    );

    const multiSchemaMap =
      config.groupBySchema ||
      options.generator.previewFeatures?.includes("multiSchema")
        ? parseMultiSchemaMap(options.datamodel)
        : undefined;

    // Generate model types
    let models = sorted(
      [...options.dmmf.datamodel.models, ...implicitManyToManyModels],
      (a, b) => a.name.localeCompare(b.name)
    ).map((m) =>
      generateModel(m, config, config.groupBySchema, multiSchemaMap)
    );

    // Extend model table names with schema names if using multi-schemas
    if (options.generator.previewFeatures?.includes("multiSchema")) {
      models = convertToMultiSchemaModels(
        models,
        config.groupBySchema,
        multiSchemaMap
      );
      enums = convertToMultiSchemaModels(
        enums,
        config.groupBySchema,
        multiSchemaMap
      );
    }

    // Generate the database type that ties it all together
    const databaseType = generateDatabaseType(models, config);

    // Parse it all into a string. Either 1 or 2 files depending on user config
    const files = generateFiles({
      databaseType,
      enumNames: options.dmmf.datamodel.enums.map((e) => e.name),
      models,
      enums,
      enumsOutfile: config.enumFileName,
      typesOutfile: config.fileName,
      groupBySchema: config.groupBySchema,
    });

    // And write it to a file!
    await Promise.allSettled(
      files.map(({ filepath, content }) => {
        const writeLocation = path.join(
          options.generator.output?.value || "",
          filepath
        );
        return writeFileSafely(writeLocation, content);
      })
    );
  },
});
