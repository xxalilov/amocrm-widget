import { DataTypes, Model, Optional } from "sequelize";
import { LeadSettings } from "../interfaces/lead-settings";

export type LeadSettingsCreationAttributes = Optional<LeadSettings, "id" | "account" | "status" | "findDublicatesBy" | "checkPipelines" | "checkStatuses" | "advantage" | "remainsStatus" | "isDifferentFunnelCheck" | "isTeg" | "teg" | "addMergedTag" | "mergedTag" | "autoMerge" | "autoInterval">;

export class LeadSettingsModel extends Model<LeadSettings, LeadSettingsCreationAttributes> implements LeadSettings {
    public id: string;
    public account: string;
    public status: string;
    public findDublicatesBy: string;
    public checkPipelines: string;
    public checkStatuses: string;
    public advantage: string;
    public remainsStatus: string;
    public isDifferentFunnelCheck: boolean;
    public isTeg: boolean;
    public teg: string;
    public addMergedTag: boolean;
    public mergedTag: string;
    public autoMerge: boolean;
    public autoInterval: number;

}

export default function (sequelize: any): typeof LeadSettingsModel {
    LeadSettingsModel.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        account: {
            type: DataTypes.UUID,
            references: {
                model: 'accounts',
                key: 'id'
            },
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'inactive',
        },
        findDublicatesBy: {
            type: DataTypes.ENUM("byContact", "byCompany"),
            allowNull: false,
            defaultValue: 'byContact',
        },
        checkPipelines: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
        checkStatuses: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
        advantage: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'newest',
        },
        remainsStatus: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
        isDifferentFunnelCheck: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        isTeg: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        teg: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: '',
        },
        addMergedTag: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        mergedTag: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'merged',
        },
        autoMerge: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        autoInterval: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5,
        }
    }, {
        tableName: 'lead_settings',
        sequelize,
    })

    return LeadSettingsModel;
}