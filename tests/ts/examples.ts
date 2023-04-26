import Ajv from 'ajv';
import { Knex, knex } from 'knex';
import * as objection from '../../';
import {
  DBError,
  fn,
  QueryBuilder,
  raw,
  ref,
  RelationMapping,
  RelationMappings,
  StaticHookArguments,
  val,
} from '../../';

// This file exercises the Objection.js typings.

// These calls are WHOLLY NONSENSICAL and are for TypeScript testing only. If
// you're new to Objection, and want to see how to use TypeScript, please look
// at the code in ../examples/express-ts.

// These "tests" pass if the TypeScript compiler is satisfied.

class CustomValidationError extends Error {}

class CustomValidator extends objection.Validator {
  beforeValidate(args: objection.ValidatorArgs): void {
    if (!args.options.skipValidation) {
      args.ctx.whatever = 'anything';
      args.ctx.foo = args.json.required;
      const id = args.model.$id;
    }
  }

  validate(args: objection.ValidatorArgs): objection.Pojo {
    if (args.options.patch) {
      args.json.required = [];
    }
    return args.json;
  }

  afterValidate(args: objection.ValidatorArgs): void {
    args.json.required = args.ctx.foo;
  }
}

class Person extends objection.Model {
  // With TypeScript 2.7, fields in models need either optionality:
  firstName?: string;
  // Or for not-null fields that are always initialized, you can use the new ! syntax:
  // prettier-ignore
  lastName!: string;
  mom?: Person;
  children?: Person[];
  // Note that $relatedQuery won't work for optional fields (at least until TS 2.8), so this gets a !:
  // prettier-ignore
  pets!: Animal[];
  comments?: Comment[];
  movies?: Movie[];

  static columnNameMappers = objection.snakeCaseMappers();

  static jsonSchema = {
    type: 'object',

    properties: {
      firstName: {
        type: 'string',
      },
    },
  };

  static async beforeFind({
    asFindQuery,
    cancelQuery,
  }: StaticHookArguments<Person>): Promise<void> {
    takesPeople(await asFindQuery());
    cancelQuery([]);
  }

  static async afterUpdate({
    asFindQuery,
    result,
    items,
  }: StaticHookArguments<Person, number>): Promise<void> {
    takesPeople(await asFindQuery());
    takesNumber(result!);
    takesPeople(items as Person[]);
  }

  examplePersonMethod = (arg: string) => 1;

  static staticExamplePersonMethod() {
    return 100;
  }

  petsWithId(petId: number): PromiseLike<Animal[]> {
    return this.$relatedQuery('pets').where('id', petId);
  }

  commentsWithId(commentId: number): Promise<Comment[]> {
    return this.$relatedQuery('comments').where('id', commentId).execute();
  }

  fetchMom(): PromiseLike<Person | undefined> {
    return this.$relatedQuery('mom');
  }

  async $beforeInsert(queryContext: objection.QueryContext) {
    console.log(queryContext.someCustomValue);
  }

  $formatDatabaseJson(json: objection.Pojo) {
    // Test that any property can be accessed and set.
    json.bar = json.foo;
    return json;
  }

  $parseDatabaseJson(json: objection.Pojo) {
    // Test that any property can be accessed and set.
    json.foo = json.bar;
    return json;
  }

  static createValidator() {
    return new objection.AjvValidator({
      onCreateAjv(ajvalidator: Ajv) {
        // modify ajvalidator
      },
      options: {
        allErrors: false,
      },
    });
  }

  static createValidationError(args: objection.CreateValidationErrorArgs) {
    const { message, type, data } = args;
    const errorItem: objection.ValidationErrorItem = data['someProp'];
    const itemMessage: string = errorItem.message;
    return new CustomValidationError('my custom error: ' + message + ' ' + itemMessage);
  }

  static modifiers = {
    myFilter(query: QueryBuilder<Person>) {
      query.where('something', 'something');
    },
  };

  static relationMappings = () => ({
    fancyPets: {
      modelClass: Animal,
      relation: objection.Model.HasManyRelation,

      beforeInsert(pet) {
        pet.name = pet.name + ' Fancy Pants';
      },

      modify(query) {
        query.where('name', 'like', '% Fancy Pants');
      },

      join: {
        from: 'person.ownerId',
        to: 'pet.id',
      },
    } as RelationMapping<Animal>,
  });
}

function takesModelSubclass<M extends objection.Model>(m: M) {}
function takesModel(m: objection.Model) {}
function takesModelClass(m: objection.ModelClass<any>) {}

// Borrowed from https://github.com/TypeStrong/ts-expect/blob/39f04b5/src/index.ts
type TypeEqual<T, U> = Exclude<T, U> extends never
  ? Exclude<U, T> extends never
    ? true
    : false
  : false;
const expectsTrue = <T extends true>() => 1;

const takesPerson = (person: Person) => {
  person.examplePersonMethod('');
};
const takesMaybePerson = (_: Person | undefined) => 1;
const takesPeople = (_: Person[]) => 1;
const takesNumber = (_: number) => 1;

async function takesPersonClass(PersonClass: typeof Person) {
  takesPerson(new PersonClass());
  takesMaybePerson(await PersonClass.query().findById(123));
}

function takesPersonQueryBuilder(qb: objection.QueryBuilder<Person>): Promise<Person[]> {
  return qb.execute();
}

const lastName = 'Lawrence';

// Note that at least with TypeScript 2.3 or earlier, type assertions made
// on an instance will coerce the assignment to the instance type, which
// means `const p: Person = somethingThatReturnsAny()` will compile.

// It also seems that Promise types are not as rigorously asserted as their
// resolved types, hence these async/await blocks:

takesPersonQueryBuilder(Person.query());

async () => {
  takesPeople(await Person.query().where('lastName', lastName));
  takesPeople(await Person.query().where({ lastName }));
  const person = await Person.query().findById(123);
  expectsTrue<TypeEqual<Person | undefined, typeof person>>();
  takesMaybePerson(person);
  takesMaybePerson(await Person.query().findById('uid'));
};

// .where().first is equivalent to .findOne:
async () => {
  takesMaybePerson(await Person.query().where(raw('raw SQL constraint')).first());
  takesMaybePerson(await Person.query().where('lastName', lastName).first());
  takesMaybePerson(await Person.query().where('lastName', '>', lastName).first());

  const person = await Person.query().where({ lastName }).first();
  expectsTrue<TypeEqual<Person | undefined, typeof person>>();
  takesMaybePerson(person);

  takesMaybePerson(await Person.query().findOne(raw('raw SQL constraint')));
  takesMaybePerson(await Person.query().findOne('lastName', lastName));
  takesMaybePerson(await Person.query().findOne('lastName', '>', lastName));

  const person2 = await Person.query().findOne({ lastName });
  expectsTrue<TypeEqual<Person | undefined, typeof person2>>();
  takesMaybePerson(person2);
};

// union/unionAll types

async () => {
  await Person.query()
    .where({ lastName: 'finnigan' })
    .union(
      // supports callbacks, or querybuilders along-side each other.
      Person.query().where({ lastName: 'doe' }),
      (qb) => qb.table(Person.tableName).where({ lastName: 'black' })
    );
  await Person.query()
    .where({ lastName: 'finnigan' })
    .union(
      // multiple query builders
      Person.query().where({ lastName: 'doe' }),
      Person.query().where({ lastName: 'black' })
    );
  await Person.query()
    .where({ lastName: 'finnigan' })
    .union(
      // supports callbacks, or querybuilders along-side each other.
      (qb) => qb.table(Person.tableName).where({ lastName: 'doe' }),
      (qb) => qb.table(Person.tableName).where({ lastName: 'black' })
    );
  // checks for unions that include wrap options
  await Person.query()
    .where({ lastName: 'finnigan' })
    .union(
      [
        (qb) => qb.table(Person.tableName).where({ lastName: 'doe' }),
        (qb) => qb.table(Person.tableName).where({ lastName: 'black' }),
      ],
      true
    );
  await Person.query()
    .where({ lastName: 'finnigan' })
    .union((qb) => qb.table(Person.tableName).where({ lastName: 'black' }), true);
  await Person.query()
    .where({ lastName: 'finnigan' })
    .union(
      // allows `wrap` to be passed as the last argument alongside
      // other forms of unions. supports up to 7 union args before wrap arg.
      Person.query().where({ lastName: 'doe' }),
      (qb) => qb.table(Person.tableName).where({ lastName: 'doe' }),
      (qb) => qb.table(Person.tableName).where({ lastName: 'black' }),
      true
    );

  await Person.query().intersect(Person.query().where({ lastName: 'doe' }), (qb) =>
    qb.table(Person.tableName).where({ lastName: 'black' })
  );
};

// .query().castTo()
async () => {
  const animals = await Person.query()
    .joinRelated('children.children.pets')
    .select('children:children:pets.*')
    .castTo(Animal);

  takesAnimals(animals);
};

// instance methods:
async () => {
  const person = new Person();

  takesPerson(await person.$fetchGraph('movies'));
  takesPerson(await person.$query());
  takesPerson(
    await person.$query().patchAndFetch({
      firstName: 'Test',
      lastName: 'Name',
    })
  );
};

class Movie extends objection.Model {
  // prettier-ignore
  title!: string;
  // prettier-ignore
  actors!: Person[];
  // prettier-ignore
  director!: Person;

  fetchDirector(): PromiseLike<Person> {
    return this.$relatedQuery('director');
  }

  /**
   * This static field instructs Objection how to hydrate and persist
   * relations. By making relationMappings a thunk, we avoid require loops
   * caused by other class references.
   */
  static relationMappings: RelationMappings = {
    actors: {
      relation: objection.Model.ManyToManyRelation,
      modelClass: Person,
      join: {
        from: ['Movie.id1', 'Model.id2'],
        through: {
          from: 'Actors.movieId',
          to: ref('Actors.personId').castInt(),
        },
        to: [ref('Person.id1'), 'Person.id2'],
      },
      filter: (qb) => qb.orderByRaw('coalesce(title, id)'),
    },
    director: {
      relation: objection.Model.BelongsToOneRelation,
      modelClass: Person,
      join: {
        from: 'Movie.directorId',
        to: 'Person.id',
      },
    },
  };
}

const cols1: string[] = Person.tableMetadata().columns;
const cols2: Promise<objection.TableMetadata> = Person.fetchTableMetadata();

function takesMovie(m: Movie) {
  m.title = '';
}

async () => {
  // Another example of strongly-typed $relatedQuery without a cast:
  takesPeople(await new Movie().$relatedQuery('actors'));
  takesPerson(await new Movie().$relatedQuery('director'));

  takesMaybePerson(await new Movie().$relatedQuery('actors').first());
  takesMaybePerson(await new Movie().$relatedQuery('director').where('age', '>', 32));
};

const relatedPersons: PromiseLike<Person[]> = new Person().$relatedQuery('children');
const relatedMovies: PromiseLike<Person[]> = new Movie().$relatedQuery('actors');

class Animal extends objection.Model {
  // prettier-ignore
  species!: string;
  name?: string;
  owner?: Person | null;

  // Tests the ColumnNameMappers interface.
  static columnNameMappers = {
    parse(json: objection.Pojo) {
      return json;
    },

    format(json: objection.Pojo) {
      return json;
    },
  };
}

const takesAnimal = (animal: Animal) => {
  animal.species = 'dog';
};
const takesMaybeAnimal = (_: Animal | undefined) => 1;
const takesAnimals = (_: Animal[]) => 1;

class Comment extends objection.Model {
  // prettier-ignore
  comment!: string;
}

// !!! see examples/express-ts/src/app.ts for a valid knex setup. The following is bogus:

const k: Knex = knex({});

// bindKnex returns the proper Model subclass:

const BoundPerson = Person.bindKnex(k);
takesPersonClass(BoundPerson);

// The Model subclass is interpreted correctly to be constructable

const examplePerson = new BoundPerson();
// and inherited methods from Model

const personId = examplePerson.$id();
const exampleJsonPerson1: Person = examplePerson.$setJson({ id: 'hello' });
const exampleJsonPerson2: Person = examplePerson.$set({ id: 'hello' });
const exampleDatabaseJsonPerson: Person = examplePerson.$setDatabaseJson({
  id: 'hello',
});
const omitPersonFromKey: Person = examplePerson.$omit('lastName');
const omitPersonFromObj: Person = examplePerson.$omit({ firstName: true });
const pickPersonFromKey: Person = examplePerson.$pick('lastName');
const pickPersonFromObj: Person = examplePerson.$pick({ firstName: true });
const clonePerson: Person = examplePerson.$clone();
const setRelatedPerson: Person = examplePerson.$setRelated(
  'parent',
  Person.fromJson({ firstName: 'parent' })
);
const appendRelatedPerson: Person = examplePerson.$appendRelated('pets', [
  Animal.fromJson({ firstName: 'pet 1' }),
  Animal.fromJson({ firstName: 'pet 2' }),
]);

// static methods from Model should return the subclass type
const personQB: objection.QueryBuilder<Person, Person> = Person.fetchGraph(new Person(), 'movies');
const peopleQB: objection.QueryBuilder<Person> = Person.fetchGraph([new Person()], 'movies');

const person: PromiseLike<Person> = personQB;
const people: PromiseLike<Person[]> = peopleQB;

class Actor {
  canAct?: boolean;
}

// Optional<Person> typing for findById():

function byId(id: number): Promise<Person | undefined> {
  return Person.query().findById(id).execute();
}

// Person[] typing for findByIds():

function byIds(ids: number[] | number[][]): PromiseLike<Person[]> {
  return Person.query().findByIds(ids);
}

// Person[] typing for where():

function whereSpecies(species: string): PromiseLike<Animal[]> {
  return Animal.query().where('species', species);
}

const pqb: objection.QueryBuilder<Person> = objection.QueryBuilder.forClass(Person);
const personPromise: PromiseLike<Person | undefined> = pqb.findById(1);

// QueryBuilder.findById accepts single and array values:

let qb: objection.QueryBuilder<Person> = BoundPerson.query().where('name', 'foo');

// QueryBuilder.throwIfNotFound makes an option query return exactly one:

async () => {
  const q = () => Person.query().findOne({ lastName });
  const person = await q().throwIfNotFound();
  takesPerson(person);
};

// QueryBuilder.throwIfNotFound does nothing for array results:

async () => {
  const q = () => Person.query().where({ lastName });
  takesPeople(await q());
  takesPeople(await q().throwIfNotFound());
};

// Note that the QueryBuilder chaining done in this file
// is done to verify that the return value is assignable to a QueryBuilder
// (fewer characters than having each line `const qbNNN: QueryBuilder =`):

const maybePerson: PromiseLike<Person | undefined> = qb.findById(1);
const maybePerson2: PromiseLike<Person | undefined> = qb.findById([1, 2, 3]);

// query builder knex-wrapping methods:

qb = qb.increment('column_name');
qb = qb.increment('column_name', 2);
qb = qb.decrement('column_name', 1);
qb = qb.select('column1');
qb = qb.select('column1', 'column2', 'column3');
qb = qb.select(['column1', 'column2']);
qb = qb.forUpdate();
qb = qb.as('column_name');
qb = qb.column('column_name');
qb = qb.columns('column_name', 'column_name_2');
qb = qb.withSchema('schema_name');
qb = qb.distinct('column1', 'column2', 'column3');
qb = qb.join('tablename', 'column1', '=', 'column2');
qb = qb.outerJoin('tablename', 'column1', '=', 'column2');
qb = qb.joinRelated('table');
qb = qb.joinRelated('table', { alias: false });
qb = qb.where(raw('random()', 1, '2'));
qb = qb.where(raw('random()', 1, '2'), '=', Person.knex().raw('foo'));
qb = qb.where(Person.raw('random()', 1, '2', raw('3')));
qb = qb.where(fn.coalesce(null, fn('random')), '=', 1);
qb = qb.where(Person.ref('column1'), 1);
qb = qb.alias('someAlias');
qb = qb.with('alias', Movie.query());
qb = qb.with('alias', (qb) => qb.from('someTable').select('id'));
qb = qb.whereColumn('firstName', 'lastName');
qb = qb.groupBy('firstName');
qb = qb.groupBy(['firstName', 'lastName']);
qb = qb.orderBy('firstName');
qb = qb.whereComposite('id', 1);
qb = qb.whereComposite('id', '>', 1);
qb = qb.whereComposite(['id1', 'id2'], [1, '2']);
qb = qb.whereComposite(['id1', 'id2'], Person.query());
qb = qb.whereInComposite('id', [1, 2]);
qb = qb.whereInComposite(
  ['id1', 'id2'],
  [
    [1, '2'],
    [1, '2'],
  ]
);
qb = qb.whereInComposite(['id1', 'id2'], Person.query().select('firstName', 'lastName'));

// Query builder hooks. runBefore() and runAfter() don't immediately affect the result.

const runBeforePerson: PromiseLike<Person> = qb
  .first()
  .throwIfNotFound()
  .runBefore(async (result: any, builder: objection.QueryBuilder<Person, Person>) => 88);

const runBeforePersons: PromiseLike<Person[]> = qb.runBefore(
  async (result: any, builder: objection.QueryBuilder<Person>) => 88
);

const runAfterPerson: PromiseLike<Person> = qb
  .first()
  .throwIfNotFound()
  .runAfter(async (result: any, builder: objection.QueryBuilder<Person, Person>) => 88);

const runAfterPersons: PromiseLike<Person[]> = qb.runAfter(
  async (result: any, builder: objection.QueryBuilder<Person>) => 88
);

// signature-changing QueryBuilder methods:

const rowInserted: PromiseLike<Person> = qb.insert({ firstName: 'bob' });
const rowsInserted: PromiseLike<Person[]> = qb.insert([
  { firstName: 'alice' },
  { firstName: 'bob' },
]);
const rowsInsertedWithRelated: PromiseLike<Person> = qb.insertGraph({});
const rowsInsertGraph1: PromiseLike<Person> = qb.insertGraph({
  '#id': 'root',
  firstName: 'Name',

  mom: {
    lastName: 'Hello',
  },

  movies: [
    {
      director: {
        firstName: 'Hans',
      },
    },
    {
      '#dbRef': 1,
    },
  ],

  pets: [
    {
      name: 'Pet',
    },
    {
      species: 'Doggo',
    },
    {
      name: 'Catto',

      owner: {
        '#ref': 'root',
      },
    },
  ],
});
const rowsInsertGraph2: PromiseLike<Person[]> = qb.insertGraph([
  {
    '#id': 'person',
    firstName: 'Name',

    pets: [
      {
        '#id': 'pet',
        name: 'Pet',
      },
      {
        species: 'Doggo',

        owner: {
          '#ref': 'person',
        },
      },
    ],
  },
]);
const rowsInsertGraph3: PromiseLike<Person> = qb.insertGraph({}, { relate: true });
const rowsUpdated: PromiseLike<number> = qb.update({});
const rowsPatched: PromiseLike<number> = qb.patch({});
const rowsDeleted: PromiseLike<number> = qb.delete();
const rowsDeletedById: PromiseLike<number> = qb.deleteById(123);
const rowsDeletedByIds: PromiseLike<number> = qb.deleteById([123, 456]);

const rowsUpdatedWithData: PromiseLike<number>[] = [
  qb.update({ firstName: 'name' }),
  qb.update({ firstName: ref('last_name') }),
  qb.update({ firstName: raw('"name"') }),
  qb.update({ firstName: qb.select('lastname') }),
];

const rowsPatchedWithData: PromiseLike<number>[] = [
  qb.patch({ firstName: 'name' }),
  qb.patch({ firstName: ref('last_name') }),
  qb.patch({ firstName: raw('"name"') }),
  qb.patch({ firstName: qb.select('lastname') }),
];

const insertedModel: PromiseLike<Person> = Person.query().insertAndFetch({});
const insertedModels1: PromiseLike<Person[]> = Person.query().insertGraphAndFetch([
  new Person(),
  new Person(),
]);
const insertedModels2: PromiseLike<Person[]> = Person.query().insertGraphAndFetch(
  [new Person(), new Person()],
  {
    relate: true,
  }
);

const upsertModel1: PromiseLike<Person> = Person.query().upsertGraph({});
const upsertModel2: PromiseLike<Person> = Person.query().upsertGraph({}, { relate: true });
const upsertModels1: PromiseLike<Person[]> = Person.query().upsertGraph([]);
const upsertModels2: PromiseLike<Person[]> = Person.query().upsertGraph([], {
  unrelate: true,
});

const insertedGraphAndFetchOne: PromiseLike<Person> = Person.query().insertGraphAndFetch(
  new Person()
);
const insertedGraphAndFetchSome: PromiseLike<Person[]> = Person.query().insertGraphAndFetch([
  new Person(),
  new Person(),
]);
const updatedModel: PromiseLike<Person> = Person.query().updateAndFetch({});
const updatedModelById: PromiseLike<Person> = Person.query().updateAndFetchById(123, {});
const patchedModel: PromiseLike<Person> = Person.query().patchAndFetch({});
const patchedModelById: PromiseLike<Person> = Person.query().patchAndFetchById(123, {});

const updatedModels: PromiseLike<Person>[] = [
  qb.updateAndFetch({ firstName: 'name' }),
  qb.updateAndFetch({ firstName: ref('last_name') }),
  qb.updateAndFetch({ firstName: raw('"name"') }),
  qb.updateAndFetch({ firstName: qb.select('lastname') }),

  qb.updateAndFetchById(123, { firstName: 'name' }),
  qb.updateAndFetchById(123, { firstName: ref('last_name') }),
  qb.updateAndFetchById(123, { firstName: raw('"name"') }),
  qb.updateAndFetchById(123, { firstName: qb.select('lastname') }),
];

const patchedModels: PromiseLike<Person>[] = [
  qb.patchAndFetch({ firstName: 'name' }),
  qb.patchAndFetch({ firstName: ref('last_name') }),
  qb.patchAndFetch({ firstName: raw('"name"') }),
  qb.patchAndFetch({ firstName: qb.select('lastname') }),

  qb.patchAndFetchById(123, { firstName: 'name' }),
  qb.patchAndFetchById(123, { firstName: ref('last_name') }),
  qb.patchAndFetchById(123, { firstName: raw('"name"') }),
  qb.patchAndFetchById(123, { firstName: qb.select('lastname') }),
];

const rowsEager: PromiseLike<Person[]> = Person.query().withGraphFetched('foo.bar', {
  joinOperation: 'innerJoin',
});

const rowsEager2: PromiseLike<Person[]> = Person.query().withGraphFetched({
  pets: {
    owner: {
      movies: {
        director: true,
      },
    },
  },
});

const rowsEager3: PromiseLike<Person[]> = Person.query().withGraphFetched({
  foo: {
    bar: true,
  },
});

const children: PromiseLike<Person[]> = Person.query()
  .skipUndefined()
  .allowGraph('[pets, parent, children.[pets, movies.actors], movies.actors.pets]')
  .allowGraph({ pets: true })
  .allowGraph({ parent: true })
  .withGraphFetched('children')
  .where('age', '>=', 42);

const childrenAndPets: PromiseLike<Person[]> = Person.query()
  .withGraphFetched('children')
  .where('age', '>=', 42)
  .modifyGraph('[pets, children.pets]', (qb) => qb.orderBy('name'))
  .modifyGraph('[pets, children.pets]', 'orderByName')
  .modifyGraph('[pets, children.pets]', ['orderByName', 'orderBySomethingElse']);

const childrenAndPets2: PromiseLike<Person[]> = Person.query()
  .withGraphFetched('children')
  .where('age', '>=', 42)
  .modifyGraph('[pets, children.pets]', (qb) => qb.orderBy('name'))
  .modifyGraph('[pets, children.pets]', 'orderByName')
  .modifyGraph('[pets, children.pets]', ['orderByName', 'orderBySomethingElse']);

const childrenAndPets3: PromiseLike<Person[]> = Person.query()
  .withGraphJoined('children')
  .where('age', '>=', 42)
  .modifyGraph('[pets, children.pets]', (qb) => qb.orderBy('name'))
  .modifyGraph('[pets, children.pets]', 'orderByName')
  .modifyGraph('[pets, children.pets]', ['orderByName', 'orderBySomethingElse']);

const rowsPage: PromiseLike<{
  total: number;
  results: Person[];
}> = Person.query().page(1, 10);

const rowsRange: PromiseLike<objection.Page<Person>> = Person.query().range(1, 10);

const rowsPageRunAfter: PromiseLike<objection.Page<Person>> = Person.query()
  .page(1, 10)
  .runAfter(
    async (
      result: objection.Page<Person>,
      builder: objection.QueryBuilder<Person, objection.Page<Person>>
    ) => {}
  );

// `retuning` should change the return value from number to T[]
const rowsUpdateReturning: PromiseLike<Person[]> = Person.query().update({}).returning('*');

const rowPatchReturningFirst: PromiseLike<Person | undefined> = Person.query()
  .patch({})
  .returning('*')
  .first();

// `retuning` should change the return value from number to T[]
const rowsDeleteReturning: PromiseLike<Person[]> = Person.query().delete().returning('*');

const rowsDeleteReturningFirst: PromiseLike<Person | undefined> = Person.query()
  .delete()
  .returning('*')
  .first();

const rowInsertReturning: PromiseLike<Person | undefined> = Person.query()
  .insert({})
  .returning('*');

const rowsInsertReturning: PromiseLike<Person[]> = Person.query()
  .insert([{ firstName: 'Jack' }])
  .returning('*');

// Executing a query builder should be equivalent to treating it
// as a promise directly, regardless of query builder return type:

const maybePersonQb = Person.query().findById(1);
let maybePersonPromise: PromiseLike<Person | undefined> = maybePersonQb;
maybePersonPromise = maybePersonQb.execute();

const peopleQb = Person.query();
let peoplePromise: PromiseLike<Person[]> = peopleQb;
peoplePromise = peopleQb.execute();

const insertQb = Person.query().insert({});
let insertPromise: PromiseLike<Person> = insertQb;
insertPromise = insertQb.execute();

const insertConfclitQb = Person.query().insert({}).onConflict('id').ignore();
let insertConflictPromise: PromiseLike<Person> = insertConfclitQb;
insertConflictPromise = insertConfclitQb.execute();

const insertConfclitMergeQb = Person.query()
  .insert({})
  .onConflict('id')
  .merge({ firstName: 'foo' })
  .merge(['foo']);
let insertConflictMergePromise: PromiseLike<Person> = insertConfclitMergeQb;
insertConflictMergePromise = insertConfclitMergeQb.execute();

const deleteQb = Person.query().delete();
let deletePromise: PromiseLike<number> = deleteQb;
deletePromise = deleteQb.execute();

const pageQb = Person.query().page(1, 10);
let pagePromise: PromiseLike<objection.Page<Person>> = pageQb;
pagePromise = pageQb.execute();

Person.query()
  .modify('someModifier')
  .modify('someModifier', 1, 'foo', { bar: true })
  .modify(['someModifier', 'someOtherModifier'])
  .modify((qb) => qb.where('firstName', 'lol'));

// non-wrapped methods:

const modelFromQuery = qb.modelClass();
const knexQuery = qb.toKnexQuery().toSQL();
const tableName: string = qb.tableNameFor(Person);
const tableRef: string = qb.tableRefFor(Person);

function noop() {
  // no-op
}

const qbcb = (ea: objection.QueryBuilder<Person>) => noop();

qb = qb.context({
  runAfter: qbcb,
  runBefore: qbcb,
  onBuild: qbcb,
});

const trx: objection.Transaction = qb.context().transaction;

qb = qb.context({
  foo: 'bar',
});

qb = qb.clearContext();

qb = qb.runBefore(qbcb);
qb = qb.onBuild(qbcb);
qb = qb.onBuildKnex((knexBuilder: Knex.QueryBuilder, builder: objection.QueryBuilder<Person>) => {
  if (builder.hasWheres()) {
    knexBuilder.where('foo', 'bar');
  }
});

qb = qb.reject('fail');
qb = qb.resolve('success');

const trxRes1: Promise<Person | undefined> = Person.transaction(async (trx) => {
  const person = await Person.query(trx).findById(1);
  return person;
});

const trxRes2: Promise<(Person | undefined)[]> = Person.transaction(Person.knex(), async (trx) => {
  const person = await Person.query(trx).findById(1);
  return [person];
});

const trxRes3: Promise<string> = objection.transaction(Person, (TxPerson) => {
  const n: number = new TxPerson().examplePersonMethod('hello');
  return Promise.resolve('yay');
});

objection.transaction(Movie, Person, async (TxMovie, TxPerson) => {
  const s: string = new TxMovie().title;
  const n: number = new TxPerson().examplePersonMethod('hello');
});

objection.transaction(Movie, Person, Animal, async (TxMovie, TxPerson, TxAnimal) => {
  const t: string = new TxMovie().title;
  const n: number = new TxPerson().examplePersonMethod('hello');
  const s: string = new TxAnimal().species;
});

objection.transaction(
  Movie,
  Person,
  Animal,
  Comment,
  async (TxMovie, TxPerson, TxAnimal, TxComment) => {
    const t: string = new TxMovie().title;
    const n: number = new TxPerson().examplePersonMethod('hello');
    const s: string = new TxAnimal().species;
    const c: string = new TxComment().comment;
  }
);

objection.transaction(
  Movie,
  Person,
  Animal,
  Comment,
  async (TxMovie, TxPerson, TxAnimal, TxComment, trx) => {
    const t: string = new TxMovie().title;
    const n: number = new TxPerson().examplePersonMethod('hello');
    const s: string = new TxAnimal().species;
    const c: string = new TxComment().comment;
    Movie.query(trx);
  }
);

objection.transaction.start(Person).then((trx) => {
  const TxPerson: typeof Person = Person.bindTransaction(trx);
  TxPerson.query()
    .then(() => trx.commit())
    .catch(() => trx.rollback());
  Person.query(trx).where('age', '<', 90);
});

// Verify QueryBuilders are thenable:

const p: Promise<string> = qb.then(() => 'done');

// Verify we can call `.insert` with a Partial<Person>:

Person.query().insert({ firstName: 'Chuck' });

// Verify we can call `.insert` via $relatedQuery

async () => {
  const m = await new Person().$relatedQuery('movies').insert({ title: 'Total Recall' });
  takesModel(m);
  takesMovie(m);
};

// Verify if is possible transaction class can be shared across models
objection.transaction(Person.knex(), async (trx) => {
  await Person.query(trx).insert({ firstName: 'Name' });
  await Movie.query(trx).insert({ title: 'Total Recall' });
});

objection.transaction<Person>(Person.knex(), async (trx) => {
  const person = await Person.query(trx).insert({ firstName: 'Name' });
  await Movie.query(trx).insert({ title: 'Total Recall' });
  await person.$fetchGraph('movies', { transaction: trx });

  return person;
});

objection.transaction.start(Person).then((trx) => {
  Movie.query(trx)
    .then(() => trx.commit())
    .catch(() => trx.rollback());
});

// Verify where methods take a queryBuilder of any.
const whereSubQuery = Movie.query().select('name');

Person.query().whereIn('firstName', whereSubQuery);
Person.query().whereIn(['firstName', 'lastName'], whereSubQuery);
Person.query().where('foo', whereSubQuery);
Person.query().whereExists(whereSubQuery);
Person.query().whereExists(Person.relatedQuery('pets'));
Person.query().select([Person.relatedQuery('pets').count().as('petCount')]);
Person.query().select('id', Person.relatedQuery('pets').count().as('petCount'));
Person.query().where((builder) => {
  builder.whereBetween('age', [30, 40]).orWhereIn('lastName', whereSubQuery);
});

const relQueryResult1: PromiseLike<Animal[]> = Person.relatedQuery('pets').for(1);
const relQueryResult2: PromiseLike<Animal[]> = Person.relatedQuery('pets').for([1, 2]);
const relQueryResult3: PromiseLike<Animal[]> = Person.relatedQuery('pets').for('something');
const relQueryResult4: PromiseLike<Animal[]> = Person.relatedQuery('pets').for([
  'something',
  'eles',
]);
const relQueryResult5: PromiseLike<Animal[]> = Person.relatedQuery('pets').for([
  [1, 2],
  [3, 4],
]);
const relQueryResult6: PromiseLike<Animal[]> = Person.relatedQuery('pets').for(
  Movie.query().select('id')
);
const relQueryResult7: PromiseLike<Movie[]> = Person.relatedQuery('movies').for(1);
const relQueryResult8: PromiseLike<Person[]> = Person.relatedQuery('mom').for(1);
const relQueryResult9: PromiseLike<Person[]> = Person.relatedQuery('children').for(1);
const relQueryResult10: PromiseLike<Movie[]> =
  Person.relatedQuery<Movie>('nonExistentRelation').for(1);

/**
 * https://knexjs.org/guide/query-builder.html#count
 */
Person.query().count('active', { as: 'a' });
Person.query().count('active as a');
Person.query().count({ a: 'active' });
Person.query().count({ a: 'active', v: 'valid' });
Person.query().count('id', 'active');
Person.query().count({ count: ['id', 'active'] });
Person.query().count(raw('??', ['active']));

// RawBuilder:

Person.query()
  .select(raw('coalesce(sum(??), 0) as ??', ['age', 'childAgeSum']))
  .where(raw(`?? || ' ' || ??`, 'firstName', 'lastName'), 'Arnold Schwarzenegger')
  .orderBy(raw('random()'));

// ReferenceBuilder:
// @see http://vincit.github.io/objection.js/#ref75
// https://github.com/Vincit/objection.js/blob/master/doc/includes/API.md#global-query-building-helpers
Person.query()
  .select([
    'id',
    ref('Model.jsonColumn:details.name').castText().as('name'),
    ref('Model.jsonColumn:details.age').castInt().as('age'),
  ])
  .join('OtherModel', ref('Model.jsonColumn:details.name').castText(), '=', ref('OtherModel.name'))
  .where('age', '>', ref('OtherModel.ageLimit'));

// LiteralBuilder:
Person.query().where(ref('Model.jsonColumn:details'), '=', val({ name: 'Jennifer', age: 29 }));
Person.query().where('age', '>', val(10));
Person.query().where('firstName', val('Jennifer').castText());

// Preserving result type after result type changing methods.

qb = Person.query();

const findByIdSelect: PromiseLike<Person | undefined> = qb.findById(32).select('firstName');
const findByIdSelectThrow: PromiseLike<Person> = qb
  .findById(32)
  .select('firstName')
  .throwIfNotFound();
const findByIdJoin: PromiseLike<Person | undefined> = qb
  .findById(32)
  .join('tablename', 'column1', '=', 'column2');
const findByIdJoinThrow: PromiseLike<Person> = qb
  .findById(32)
  .join('tablename', 'column1', '=', 'column2')
  .throwIfNotFound();
const findByIdJoinRaw: PromiseLike<Person | undefined> = qb.findById(32).joinRaw('raw sql');
const findByIdJoinRawThrow: PromiseLike<Person> = qb
  .findById(32)
  .joinRaw('raw sql')
  .throwIfNotFound();
const findOneWhere: PromiseLike<Person | undefined> = qb
  .findOne({ firstName: 'Mo' })
  .where('lastName', 'like', 'Mac%');
const findOneWhereThrow: PromiseLike<Person> = qb
  .findOne({ firstName: 'Mo' })
  .where('lastName', 'like', 'Mac%')
  .throwIfNotFound();
const findOneSelect: PromiseLike<Person | undefined> = qb
  .findOne({ firstName: 'Mo' })
  .select('firstName');
const findOneSelectThrow: PromiseLike<Person> = qb
  .findOne({ firstName: 'Mo' })
  .select('firstName')
  .throwIfNotFound();
const findOneWhereIn: PromiseLike<Person | undefined> = qb
  .findOne({ firstName: 'Mo' })
  .whereIn('status', ['active', 'pending']);
const findOneWhereInThrow: PromiseLike<Person> = qb
  .findOne({ firstName: 'Mo' })
  .whereIn('status', ['active', 'pending'])
  .throwIfNotFound();
const findOneWhereJson: PromiseLike<Person | undefined> = qb
  .findOne({ firstName: 'Mo' })
  .whereJsonSupersetOf('x:y', 'abc');
const findOneWhereJsonThrow: PromiseLike<Person> = qb
  .findOne({ firstName: 'Mo' })
  .whereJsonSupersetOf('x:y', 'abc')
  .throwIfNotFound();
const findOneWhereJsonIsArray: PromiseLike<Person | undefined> = qb
  .findOne({ firstName: 'Mo' })
  .whereJsonIsArray('x:y');
const findOneWhereJsonIsArrayThrow: PromiseLike<Person> = qb
  .findOne({ firstName: 'Mo' })
  .whereJsonIsArray('x:y')
  .throwIfNotFound();
const patchWhere: PromiseLike<number> = qb.patch({ firstName: 'Mo' }).where('id', 32);
const patchWhereIn: PromiseLike<number> = qb.patch({ firstName: 'Mo' }).whereIn('id', [1, 2, 3]);
const patchWhereJson: PromiseLike<number> = qb
  .patch({ firstName: 'Mo' })
  .whereJsonSupersetOf('x:y', 'abc');
const patchWhereJsonIsArray: PromiseLike<number> = qb
  .patch({ firstName: 'Mo' })
  .whereJsonIsArray('x:y');
const patchThrow: PromiseLike<number> = qb.patch({ firstName: 'Mo' }).throwIfNotFound();
const updateWhere: PromiseLike<number> = qb.update({ firstName: 'Mo' }).where('id', 32);
const updateWhereIn: PromiseLike<number> = qb.update({ firstName: 'Mo' }).whereIn('id', [1, 2, 3]);
const updateWhereJson: PromiseLike<number> = qb
  .update({ firstName: 'Mo' })
  .whereJsonSupersetOf('x:y', 'abc');
const updateWhereJsonIsArray: PromiseLike<number> = qb
  .update({ firstName: 'Mo' })
  .whereJsonIsArray('x:y');
const updateThrow: PromiseLike<number> = qb.update({ firstName: 'Mo' }).throwIfNotFound();
const deleteWhere: PromiseLike<number> = qb.delete().where('lastName', 'like', 'Mac%');
const deleteWhereIn: PromiseLike<number> = qb.delete().whereIn('id', [1, 2, 3]);
const deleteThrow: PromiseLike<number> = qb.delete().throwIfNotFound();
const deleteByIDThrow: PromiseLike<number> = qb.deleteById(32).throwIfNotFound();

// The location of `first` doesn't matter.

const whereFirst: PromiseLike<Person | undefined> = qb.where({ firstName: 'Mo' }).first();
const firstWhere: PromiseLike<Person | undefined> = qb.first().where({ firstName: 'Mo' });
const updateFirst: PromiseLike<number> = qb.update({}).first();
const updateReturningFirst: PromiseLike<Person | undefined> = qb.update({}).returning('*').first();

// Returning restores the result to Model or Model[].

const whereInsertRet: PromiseLike<Person> = qb
  .where({ lastName: 'MacMoo' })
  .insert({ firstName: 'Mo' })
  .returning('dbGeneratedColumn');
const whereMultiInsertRet: PromiseLike<Person[]> = qb
  .where({ lastName: 'MacMoo' })
  .insert([{ firstName: 'Mo' }, { firstName: 'Bob' }])
  .returning('dbGeneratedColumn');
const whereUpdateRet: PromiseLike<Person[]> = qb
  .where({ lastName: 'MacMoo' })
  .update({ firstName: 'Bob' })
  .returning('dbGeneratedColumn');
const wherePatchRet: PromiseLike<Person[]> = qb
  .where({ lastName: 'MacMoo' })
  .patch({ firstName: 'Mo' })
  .returning('age');
const whereDelRetFirstWhere: PromiseLike<Person | undefined> = qb
  .delete()
  .returning('lastName')
  .first()
  .where({ firstName: 'Mo' });

const orderByColumn: PromiseLike<Person[]> = qb.orderBy('firstName', 'asc');
const orderByColumns: PromiseLike<Person[]> = qb.orderBy([
  'email',
  { column: 'firstName', order: 'asc', nulls: 'first' },
  { column: 'lastName' },
]);

const someModel1: typeof objection.Model = Person.getRelations()['pets'].joinModelClass;
const someModel2: typeof objection.Model = Person.getRelation('pets').ownerModelClass;

// Verify that Model.query() and model.$query() return the same type of query builder.
// Confirming this prevent us from having to duplicate the tests for each.

async function checkQueryEquivalence() {
  // Confirm that every $query() type is a query() type

  let staticQB = Person.query().first().throwIfNotFound();
  const person = await staticQB;
  staticQB = person.$query();

  // Confirm that every query() type is a $query() type

  let instanceQB = person.$query();
  instanceQB = staticQB;
}

// .query, .$query, and .$relatedQuery can take a Knex instance to support
// multitenancy

const peep123: PromiseLike<Person | undefined> = BoundPerson.query(k).findById(123);

new Person().$query(k).execute();
new Person().$relatedQuery('pets', k).execute();

takesPerson(Person.fromJson({ firstName: 'jennifer', lastName: 'Lawrence' }));
takesPerson(Person.fromDatabaseJson({ firstName: 'jennifer', lastName: 'Lawrence' }));

// plugin tests for mixin and compose:

const plugin1 = {} as any as objection.Plugin;
const plugin2 = {} as any as objection.Plugin;

// DB errors
() => {
  const e = new DBError('message');

  if (e instanceof DBError) {
  }

  if (e instanceof objection.ConstraintViolationError) {
  }
};

() => {
  const BaseModel = objection.mixin(objection.Model, [plugin1, plugin2]);
  takesModelClass(BaseModel);
  takesModelSubclass(new BaseModel());
  takesModel(new BaseModel());
};

() => {
  const BaseModel = objection.mixin(objection.Model, plugin1, plugin2);
  takesModelClass(BaseModel);
  takesModelSubclass(new BaseModel());
  takesModel(new BaseModel());
};

() => {
  const PersonModel = objection.mixin(Person, plugin1, plugin2);
  takesModelClass(PersonModel);
  takesPersonClass(PersonModel);
  takesModelSubclass(new PersonModel());
};

() => {
  const plugin = objection.compose([plugin1, plugin2]);
  const BaseModel = objection.mixin(objection.Model, plugin);
  takesModelClass(BaseModel);
  takesModelSubclass(new BaseModel());
  takesModel(new BaseModel());
};

() => {
  const plugin = objection.compose(plugin1, plugin2);
  const BaseModel = objection.mixin(objection.Model, plugin);
  takesModelClass(BaseModel);
  takesModelSubclass(new BaseModel());
  takesModel(new BaseModel());
};

// .mixin example with Model:

() => {
  class MyModel extends objection.mixin(objection.Model, plugin1) {
    readonly myModelMethod = true;
  }
  takesModelClass(MyModel);
  takesModelSubclass(new MyModel());
};

// Example with subclass of Model:
() => {
  class MyPerson extends objection.mixin(Person, plugin1) {}
  takesModelClass(MyPerson);
  takesPersonClass(MyPerson);
  takesModelSubclass(new MyPerson());
};

// Examples with composite key
class Interview extends objection.Model {
  interviewer!: number;
  interviewee!: number;
  interviewDate?: number;

  static columnNameMappers = objection.snakeCaseMappers();

  static idColumn = ['interviewer', 'interviewee'];
}

async () => {
  // findById with composite key
  const interview: Interview | undefined = await Interview.query().findById([10, 11]);

  // findById with composite key, chained with other query builder methods
  const interviewWithAssignedDate: Interview | undefined = await Interview.query()
    .findById([10, 11])
    .whereNotNull('interviewDate');

  // findByIds with sets of composite key
  const interviews: Interview[] = await Interview.query().findByIds([
    [10, 11],
    [11, 12],
    [12, 13],
  ]);

  // findByIds with sets of composite key, chained with other query builder methods
  const interviewsWithAssignedDate: Interview[] = await Interview.query()
    .findByIds([
      [10, 11],
      [11, 12],
      [12, 13],
    ])
    .whereNotNull('interviewDate');
};

Person.fromJson({ id: 1 }).$modelClass.query();
