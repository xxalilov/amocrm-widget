import { DataTypes, Model, Optional, Sequelize } from "sequelize";
import { ScanStat } from "../interfaces/scan-stat";

export type ScanStatCreationAttributes = Optional<ScanStat, "id" | "scanned" | "groupsFound" | "scannedAt">;

export class ScanStatModel extends Model<ScanStat, ScanStatCreationAttributes> implements ScanStat {
    public id: string;
    public account: string;
    public type: string;
    public scanned: number;
    public groupsFound: number;
    public scannedAt: Date;
}

export default function (sequelize: Sequelize): typeof ScanStatModel {
    ScanStatModel.init({
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
        scanned: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        groupsFound: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        scannedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    }, {
        tableName: 'scan_stats',
        sequelize,
        indexes: [{ unique: true, fields: ['account', 'type'] }],
    });

    return ScanStatModel;
}
