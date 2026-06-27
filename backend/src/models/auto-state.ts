import { DataTypes, Model, Optional } from "sequelize";
import { AutoState } from "../interfaces/auto-state";

export type AutoStateCreationAttributes = Optional<
    AutoState,
    "id" | "nextDueAt" | "leaseToken" | "leaseExpiresAt" | "lastRunAt" | "lastMerged" | "lastFailed" | "lastError"
>;

export class AutoStateModel extends Model<AutoState, AutoStateCreationAttributes> implements AutoState {
    public id: string;
    public account: string;
    public type: string;
    public nextDueAt: Date | null;
    public leaseToken: string | null;
    public leaseExpiresAt: Date | null;
    public lastRunAt: Date | null;
    public lastMerged: number;
    public lastFailed: number;
    public lastError: string;
}

export default function (sequelize: any): typeof AutoStateModel {
    AutoStateModel.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        account: {
            type: DataTypes.UUID,
            references: { model: 'accounts', key: 'id' },
            allowNull: false,
        },
        type: {
            type: DataTypes.ENUM('contact', 'lead'),
            allowNull: false,
        },
        nextDueAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        leaseToken: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        leaseExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        lastRunAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        lastMerged: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        lastFailed: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        lastError: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
    }, {
        tableName: 'auto_states',
        sequelize,
        indexes: [{ unique: true, fields: ['account', 'type'] }],
    });

    return AutoStateModel;
}
