import { DataTypes, Model, Optional } from "sequelize";
import { ContactSettings } from "../interfaces/contact-settings";

export type ContactSettingsCreationAttributes = Optional<ContactSettings, "id" | "account" | "status" | "fields" | "isFormatNumber" | "checkNumberLength" | "isTeg" | "teg" | "addMergedTag" | "mergedTag">;

export class ContactSettingsModel extends Model<ContactSettings, ContactSettingsCreationAttributes> implements ContactSettings {
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

}

export default function (sequelize: any): typeof ContactSettingsModel {
    ContactSettingsModel.init({
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
        fields: {
            type: DataTypes.ENUM('name', 'phone', 'email'),
            allowNull: false,
            defaultValue: "phone",
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
        }
    }, {
        tableName: 'contact_settings',
        sequelize,
    })

    return ContactSettingsModel;
}