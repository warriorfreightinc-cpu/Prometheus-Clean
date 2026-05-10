import { Messages } from "src/shared/messages/messages.model";
import * as fs from "fs-extra";
import { UnsupportedMediaTypeException } from "@nestjs/common";

export const editFileName = (req, file, callback) => {
    const fileExtName = file.originalname.match(/\.[0-9a-z]+$/i)[0];

    if(![".pdf",".doc",".docx"].includes(fileExtName)){
        callback(new UnsupportedMediaTypeException(),null)
        return
    }
    


    const fileType = req.params.fileType;
    callback(null, `${fileType}${fileExtName}`);
};

export const editDestination = async (req, file, callback) => {
    const companyId = req.companyId;

    let dir = `./files/${companyId}`;

    fs.ensureDir(dir)
        .then(() => callback(null, dir))
        .catch((err) => {
            req.dirError = Messages.UploadError;
            callback(null, "");
        });
};

export const renewDestination = async (req, file, callback) => {
    const companyId = req.user.companyId.toString();

    let dir = `./files/${companyId}`;
    fs.ensureDir(dir)
        .then(() => callback(null, dir))
        .catch((err) => {
            req.dirError = Messages.UploadError;
            callback(null, "");
        });
};