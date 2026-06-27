import { DataTypes, Model, Optional, Sequelize } from "sequelize";
import { MergeHistory, MergeHistoryEntry } from "../interfaces/merge-history";

export type MergeHistoryCreationAttributes = Optional<MergeHistory, "id" | "mainName" | "duplicates" | "tag">;

export class MergeHistoryModel extends Model<MergeHistory, MergeHistoryCreationAttributes> implements MergeHistory {
    public id: string;
    public account: string;
    public type: string;
    public action: string;
    public mainId: number;
    public mainName: string;
    public duplicates: MergeHistoryEntry[];
    public tag: string;
    public readonly createdAt!: Date;
}

export default function (sequelize: Sequelize): typeof MergeHistoryModel {
    MergeHistoryModel.init({
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
            type: DataTypes.ENUM('contact', 'lead', 'company'),
            allowNull: false,
        },
        action: {
            type: DataTypes.ENUM('merge', 'tag'),
            allowNull: false,
            defaultValue: 'merge',
        },
        mainId: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        mainName: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
        duplicates: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: [],
        },
        tag: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
    }, {
        tableName: 'merge_history',
        sequelize,
    });

    return MergeHistoryModel;
}
