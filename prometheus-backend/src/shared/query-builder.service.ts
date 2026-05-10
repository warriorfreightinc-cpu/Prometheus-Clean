import { Injectable } from "@nestjs/common";

export enum EqualType {
    NO_EQUAL = 1,
    EQUAL_LEFT = 2,
    EQUAL_RIGHT = 3,
    EQUAL = 4
}

export enum ConvertIdType {
    OBJECT_ID = 1,
    STRING = 2,
    NO_CONVERTION = 0
}

export enum SortOrder {
    ASCENDIND = 1,
    DESCENDING = -1
}

export interface IOptions {
    pageable: boolean;
    pageSize?: number;
    currentPage?: number;
}

@Injectable()
export class QueryBuilderService {

    private queries: Query[] = [];

    private options: IOptions={pageable:false};

    constructor() {}
    
    setOptions(options: IOptions) {
        this.options = options;
    }

    public addQuery(name?: string) {
        let newquery = new Query(name);
        this.queries.push(newquery);
        return newquery;
    }

    public cloneQuery(name: string, query: Query) {
        let cloned = query.clone(name)
        this.queries.push(cloned)
        return cloned;
    }

    private build() {

        if (this.queries.length === 1 && this.options.pageable) {

            if (!this.options.currentPage || !this.options.pageSize) {
                throw ("pageSize and currentPage are mandatory when pagination is enapled")
            }


            let skip = this.options.currentPage > 0 ? ((this.options.currentPage - 1) * this.options.pageSize) : 0
            let limit = this.options.pageSize;


            let orig: Query = this.queries[0];
            let cloned: Query = this.cloneQuery(orig.getName() + "_count", orig).AddCustomStage({
                $group: { _id: null, count: { $sum: 1 } }
            }).addStage().unprojectFields(['_id'])

            orig.addStage().skip(skip).addStage().limit(limit);

            let builded = this.queries.map((q: Query) => {
                return q.getValue();
            })

            let name: string = orig.getName();
            let name_count: string = cloned.getName()


            let value = { $facet: {} }
            value.$facet[name] = builded[0];
            value.$facet[name_count] = builded[1]

            return value;
        }
        else if (this.queries.length === 1 && !this.options.pageable) {
            return this.queries[0].getValue()
        }

        else if (this.queries.length > 1) {

            let value = { $facet: {} }
            this.queries.forEach((q: Query) => {
                let name: string = q.getName()
                value.$facet[name] = q.getValue()
            })

            return value;
        }

        throw "No defined Queries"
    }

    public execute(model) {
        return model.aggregate([this.build()])
    }

    public static executeMultyModel(models: Array<any>, queries: Array<Query>, reducers, options: IOptions) {
        let promises: Array<Promise<any>> = []
        queries.forEach((q: Query, i: number) => {
            promises.push(models[i].aggregate(q.getValue()))
        })

        return new Promise((resolve, reject) => {
            Promise.all(promises).then(res => {
                let page = []
                res.forEach(r => {
                    r.forEach(rr => {
                        page.push(rr)
                    })
                })


                let accumulator = {}
                reducers.forEach(r => {
                    if (r.type === "map")
                        page = page.map(r.value)
                    if (r.type === "sort")
                        page = page.sort(r.value)
                    if (r.type === "filter")
                        page = page.filter(r.value)
                    if (r.type === "reduce")
                        accumulator = page.reduce(r.value, r.initialValue)

                })


                let cnt: number = page.length
                if (cnt === 0)
                    resolve({ result: [], count: cnt, accumulator: accumulator })

                if (options.pageable) {
                    if (!options.currentPage || !options.pageSize) {
                        throw ("pageSize and currentPage are mandatory when pagination is enapled")
                    }
                    let skip = options.currentPage > 0 ? ((options.currentPage - 1) * options.pageSize) : 0
                    let limit = options.pageSize;
                    page = page.slice(skip, skip + limit)
                }



                resolve({ result: page, count: cnt, accumulator: accumulator })

            }).catch(err => {
                reject(err)
            })
        })

    }

    public static createQuery(name?: string): Query {
        return new Query(name);
    }


}

export class Query {
    private stages: any[] = []
    private stage: Stage;
    private name: string;

    constructor(name?: string, query?: Query) {
        if (name)
            this.name = name;

        if (query)
            this.stages = [...query.stages]
    }

    clone(name: string) {
        let cloned = new Query()

        cloned.name = name;
        cloned.stages = [...this.stages]

        return cloned
    }

    public getName(): string {
        return this.name
    }

    public addStage(): Query {
        this.stage = new Stage()
        this.stages.push(this.stage)
        return this
    }

    public match(field: string, value: any): Query {
        this.stage.match(field, value)
        return this;
    }

    public matchNotEqual(field: string, value: any): Query {
        this.stage.matchNotEqual(field, value)
        return this;
    }

    public matchGreaterThan(field: string, value: any, type: EqualType): Query {
        this.stage.matchGreaterThan(field, value, type)
        return this;
    }

    public matchLessThan(field: string, value: any, type: EqualType): Query {
        this.stage.matchLessThan(field, value, type)
        return this;
    }

    public matchIn(field: string, value: any): Query {
        this.stage.matchIn(field, value)
        return this;
    }

    public matchBetween(field: string, value: any, type: EqualType): Query {
        this.stage.matchBetween(field, value, type)
        return this;
    }

    public projectFields(fields): Query {
        this.stage.projectFields(fields, 1)
        return this;
    }

    public unprojectFields(fields): Query {
        this.stage.projectFields(fields, 0)
        return this;
    }

    public projectFieldAs(field: string, as: string): Query {
        this.stage.projectFieldAs(field, as)
        return this;
    }

    public projectFieldCustom(field: string, value: any): Query {
        this.stage.projectFieldCustom(field, value)
        return this;
    }

    public projectFieldDefault(field: string, as: string, def_val: any): Query {
        this.stage.projectFieldDefault(field, as, def_val)
        return this;
    }

    public addField(field: string, value: any): Query {
        this.stage.addField(field, value)
        return this;
    }

    public unwind(field: string, preserveNullAndEmptyArrays: boolean): Query {
        this.stage.unwind(field, preserveNullAndEmptyArrays)
        return this;
    }

    public lookup(collection: string, id_source: string, id_target: string, idType: ConvertIdType, query, otherFields = {}): Query {

        if (idType == ConvertIdType.STRING)
            this.stage.addField('id_source_cnvrt', { $toString: `$${id_source}` })
        else if (idType == ConvertIdType.OBJECT_ID) {
            this.stage.addField('id_source_cnvrt', { $toObjectId: `$${id_source}` });
        }
        else if (idType == ConvertIdType.NO_CONVERTION) {
            this.stage.addField('id_source_cnvrt', `$${id_source}`);
        }
        this.addStage()
        this.stage.lookup(collection, id_target, query, idType, otherFields)
        return this
    }

    public sort(field: string, order: SortOrder): Query {
        this.stage.sort(field, order)
        return this
    }

    public skip(value: number): Query {
        this.stage.skip(value)
        return this
    }
    public limit(value: number): Query {
        this.stage.limit(value)
        return this
    }

    public AddCustomStage(value: any): Query {
        this.stage = new Stage()
        this.stage.setValue(value)
        this.stages.push(this.stage)
        return this;

    }

    public getValue() {
        return this.stages.map((s: Stage) => {
            return s.getValue()
        })
    }
}

class Stage {

    private value: any = {};

    public match(field: string, value): void {
        if (!this.value.$match)
            this.value.$match = {};
        this.value.$match[field] = value;
    }

    public matchIn(field: string, values: any[]): void {
        if (!this.value.$match)
            this.value.$match = {};
        this.value.$match[field] = { $in: values };
    }

    public matchNotEqual(field: string, value): void {
        if (!this.value.$match)
            this.value.$match = {};
        this.value.$match[field] = { $ne: value };
    }

    public matchGreaterThan(field: string, value, type: EqualType): void {

        let res = {}
        if (type == EqualType.EQUAL)
            res = { $gte: value }
        else
            res = { $gt: value }

        if (!this.value.$match)
            this.value.$match = {};
        this.value.$match[field] = res;
    }

    public matchLessThan(field: string, value, type: EqualType): void {

        let res = {}
        if (type === EqualType.EQUAL)
            res = { $lte: value }
        else
            res = { $lt: value }

        if (!this.value.$match)
            this.value.$match = {};
        this.value.$match[field] = res;
    }

    public matchBetween(field: string, values: any[], type): void {

        let res = {};
        if (type === EqualType.EQUAL)
            res = { $gte: values[0], $lte: values[1] }
        else if (type === EqualType.NO_EQUAL)
            res = { $gt: values[0], $lt: values[1] }
        else if (type === EqualType.EQUAL_LEFT)
            res = { $gte: values[0], $lt: values[1] }
        else if (type === EqualType.EQUAL_RIGHT)
            res = { $gt: values[0], $lte: values[1] }

        if (!this.value.$match)
            this.value.$match = {};
        this.value.$match[field] = res;
    }


    public projectFields(fields: string[], project): void {
        if (!this.value.$project)
            this.value.$project = {};
        fields.forEach(field => {
            this.value.$project[field] = project
        });
    }

    public projectFieldAs(field: string, as: string): void {
        if (!this.value.$project)
            this.value.$project = {};
        this.value.$project[as] = `$${field}`

    }

    public projectFieldDefault(field: string, as: string, def_val: any): void {
        if (!this.value.$project)
            this.value.$project = {};
        this.value.$project[as] = { $ifNull: [`$${field}`, def_val] }

    }

    public projectFieldCustom(field: string, value: any): void {
        if (!this.value.$project)
            this.value.$project = {};
        this.value.$project[field] = value

    }

    public addField(field: string, value: any): void {
        if (!this.value.$addFields)
            this.value.$addFields = {};
        this.value.$addFields[field] = value

    }

    public sort(field: string, order: SortOrder): void {

        if (!this.value.$sort)
            this.value.$sort = {};
        this.value.$sort[field] = order

    }

    public skip(value: number): void {
        this.value.$skip = value
    }
    public limit(value: number): void {
        this.value.$limit = value
    }

    public unwind(field: string, preserveNullAndEmptyArrays: boolean): void {
        this.value.$unwind = { path: `$${field}`, preserveNullAndEmptyArrays: preserveNullAndEmptyArrays }
    }



    public lookup(collection: string, id_target: string, query, idType: ConvertIdType = ConvertIdType.NO_CONVERTION, otherFields = {}): void {

        let pipeline = [{ $match: { $expr: { $eq: [`$${id_target}`, '$$id_source'] } } }, ...query]
        // if(idType===ConvertIdType.STRING)  
        // {
        //     pipeline=[{ $match: {id_target: '$$id_source'} }, ...query]
        // }  


        this.value.$lookup = {
            from: collection,
            let: {
                id_source: `$id_source_cnvrt`,
                ...otherFields
            },
            pipeline: pipeline,
            as: collection
        }
    }

    public setValue(value): void {
        this.value = value;
    }



    public getValue(): any {
        return this.value;
    }
}