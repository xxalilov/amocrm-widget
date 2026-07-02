import { DataTypes, Model, Optional } from "sequelize";
import { CompanySettings } from "../interfaces/company-settings";

export type CompanySettingsCreationAttributes = Optional<CompanySettings, "id" | "account" | "status" | "fields" | "isFormatNumber" | "checkNumberLength" | "isTeg" | "teg" | "addMergedTag" | "mergedTag" | "autoMerge" | "autoInterval" | "preventDuplicates">;

export class CompanySettingsModel extends Model<CompanySettings, CompanySettingsCreationAttributes> implements CompanySettings {
    public id: string;
    public account: string;
    public status: string;
    public fields: string;
    public isFormatNumber: boolean;
    public checkNumberLength: number;
    public isTeg: boolean;
    public teg: string;
    public addMergedTag: boolean;
    public mergedTag: string;
    public autoMerge: boolean;
    public autoInterval: number;
    public preventDuplicates: boolean;

}

export default function (sequelize: any): typeof CompanySettingsModel {
    CompanySettingsModel.init({
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
            defaultValue: 'active',
        },
        fields: {
            type: DataTypes.ENUM('name', 'phone', 'email'),
            allowNull: false,
            defaultValue: "name",
        },
        isFormatNumber: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        checkNumberLength: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 9,
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
        },
        preventDuplicates: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        }
    }, {
        tableName: 'company_settings',
        sequelize,
    })

    return CompanySettingsModel;
}
