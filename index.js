
/**
 * Created by karan on 1/03/2018.
 * Assumes at max 1 assignment per class, else need to update function getAssignment().
 */
//'use strict';

var testhelpers = require('./testhelpers');
var colors = require('colors');
var productConfig = require('./config/products');
var classConfig = require('./config/classes');
var cpConfig = require('./config/classproduct');
var assignmentConfig = require('./config/assignment');

var gbl_product_service_url = process.env.product_server_url;
var gbl_auth_service_url = process.env.auth_server_url;

let products = {}, users = {}, assignment = {}, output = {};
let filePath = __dirname+'/output.txt';


let config_data = {
    admin:{
        username: process.env.Admin_Username,
        password: process.env.Admin_Password,
        orgid: process.env.Org_Name,
        token: ""
    },
    sis_import_users: {csv: "./config/sis_import_users.csv" },
    teachers: [
        {
        username : 'teacher1',
        password : 'Compro11'
        },
        {
        username : 'teacher2',
        password : 'Compro11'
        }
    ],
    products :productConfig,
    classes: classConfig,
    class_product : cpConfig,
    assignment : assignmentConfig
};

function authenticateAdmin(callback){
    var authData = config_data.admin;
    var org = config_data.admin.orgid;
    testhelpers.post(gbl_auth_service_url + 'auth/' + org + '/token',
        {"username": authData.username,   "password": authData.password},
        {"Accept": 'application/json'},
        function(err , res) {
            if (err) {
                config_data.admin.token = null;
                console.log(err);
                console.log("Error while user authenication".red);
                console.log((" For username: " + authData.username).red);
            }
            else {
                config_data.admin.token = res.body.access_token;
                console.log(("Successfully authenticated user with username: " + authData.username).green);
            }
            if(callback){
                callback();
            }
    });
}

function updateOrgSettings(callback){
    var org = config_data.admin.orgid;
    testhelpers.put(gbl_auth_service_url + 'org/' + org + '/settings',
        { "lti": {
            "auto_entitle_classproducts": true,
            "enable": true,
            "user_enrollments": 500
           },
            "product": {
                "promote": "disabled",
                "archive": "enabled",
                "ingestion": "enabled"
            },
            "provisioning": {
                "general": {
                    "product-entitlement": true
                }
            },
            "registrations": {
            "user": {
                "strategy": "automated",
                "enabled": true
            }
        }},
        { "Authorization" : config_data.admin.token},
        function(err , res) {
            if (err) {
                console.log(err);
                console.log("Error while updating settings of org".red);
            }
            else {
                console.log(("Successfully updating settings of org ").green);
            }
            if(callback){
                callback();
            }
        });
}

function authenticateTeachers(callback){
    var org = config_data.admin.orgid;
    var authenticateTeachertLoop = function(counter, authenticateTeacherCallback){
        var username = config_data.teachers[counter].username;
        var password = config_data.teachers[counter].password;
        testhelpers.post(gbl_auth_service_url + 'auth/' + org + '/token',
            {"username": username, "password": password},
            {"Accept": 'application/json'},
            function(err , res) {
                if (err) {
                    console.log(err);
                    console.log("Error while user authenication".red);
                    console.log((" For username: " + username).red);
                }
                else {
                    try{
                        users[username]={};
                        users[username].uuid = res.body.user.uuid;
                        config_data.teachers[counter].token = res.body.access_token;
                        console.log(("Successfully authenticated user with username: " + config_data.teachers[counter].username).green);
                    }catch(err){
                        console.log((err.message).red);
                    }
                }
                if(++counter < config_data.teachers.length){
                    authenticateTeachertLoop(counter ,authenticateTeacherCallback);
                }
                else {
                    authenticateTeacherCallback();
                }
            });

    };
    authenticateTeachertLoop(0 , function(){
        callback();
    });
}

function setupUsers(callback){
    var org = config_data.admin.orgid;
    testhelpers.uploadFile(gbl_auth_service_url + 'org/' + org + '/sis_imports',
        {
            "import_type": "users",
            "extension": "csv"
        } ,
        config_data.sis_import_users.csv,
        {
            "Authorization" : config_data.admin.token
        },
        function (err , res) {
            if (err) {
                console.log(err);
                console.log(("Error while sis import of users csv ").red);
            } else {
                config_data.sis_import_users.sis_import_jobid = res.body.uuid;
                console.log(("Successfully imported user with jobid " + res.body.uuid ).green);
                if(callback){
                    callback();
                }
            }
     });

}

function registerProducts(callback){
    var productsArr = config_data.products;
    var org = config_data.admin.orgid;
    var registerProductLoop = function(counter, registerProductCallback){
        try{
            var product = productsArr[counter];
            var name = product["name"];
            var product_title = product["title"];
            var product_type = product["type"];
            var product_code =  product["code"];
            var body = {
                "producttitle": product_title,
                "producttype": product_type,
                "productcode" : product_code
            };
            if(product.hasOwnProperty("github")){
                body.repositorytype = product["github"];
                body.github = {};
                body.github.repository = product["gitURL"];
                body.github.token = product["gitToken"]
            }
            if(product.hasOwnProperty("s3")){
                body.repositorytype = product["s3"];
                body.s3 = {};
                body.s3.bucket = product["bucket"];
                body.s3.accessKeyId = product["accessKeyId"];
                body.s3.secretAccessKey = product["secretAccessKey"];
            }
        }catch(err){
            console.log((err.message).red);
        }
        return function(i){
            testhelpers.post(gbl_product_service_url + org +'/products/register' ,
                body ,
                {"Authorization" : config_data.admin.token},
                function (err , res ) {
                    if (err) {
                        console.log(err);
                        console.log(("Error while registering product with title" + product_title).red);
                    } else {
                        try{
                            products[name] = {};
                            products[name].id = res.body.uuid;
                            products[name].code = product_code;
                            products[name].title = product_title;
                            config_data.products[i].id = res.body.uuid;
                            if(product.hasOwnProperty("versionid"))
                                products[name].versionid = product['versionid'];
                            if(product.hasOwnProperty("folder"))
                                products[name].folder = product['folder'];
                            console.log(("Successfully registered product with product title: "+res.body.registrationtitle).green);
                        }catch(err){
                            console.log((err.message).red);
                        }
                    }

                    if(++counter < productsArr.length){
                        registerProductLoop(counter ,registerProductCallback);
                    }
                    else {
                        registerProductCallback();
                    }
                });
        }(counter);
    };

    registerProductLoop( 0 , function(){
        callback();
    });

}

function ingestProducts(callback){
    var productsArr = config_data.products;
    var org = config_data.admin.orgid;
    var ingestProductLoop = function(counter, ingestProductLoopCallback){
        var product = productsArr[counter];
        var product_id = product["id"];
        var branchref = product["code"];

        return function(i){
            testhelpers.post(gbl_product_service_url + org + '/products/' + product_id + '/ingest',
                {
                    "branchref": branchref
                },
                {"Authorization": config_data.admin.token},
                function (err, res) {
                    if (err) {
                        console.log(err);
                        console.log(("Error while ingesting product with id " + product_id + " in branch: " + branchref).red);
                    } else {
                        try{
                            config_data.products[i]['repo'] = "git";
                            config_data.products[i]['branchref'] = config_data.products[i]['code'];
                            console.log(("Successfully ingested product with id " + product_id + " in branch: " + branchref).green);
                        }catch(err){
                            console.log((err.message).red);
                        }
                    }
                    if(++counter < productsArr.length){
                        ingestProductLoop(counter ,ingestProductLoopCallback);
                    }
                    else {
                        ingestProductLoopCallback();
                    }
                });
        }(counter);
    };

    ingestProductLoop( 0 , function(){
        callback();
    });

}

function createClasses(callback){
    var org = config_data.admin.orgid;
    var classes = config_data.classes;
    var createClassesLoop = function(counter, createClassesLoopCallback){
        return function(i){
            let token;
            try{
                let tokenOfUser = classes[i].tokenOfUser;
                token = config_data.teachers.filter(function (entity) {
                    if(entity.username == tokenOfUser) {
                        return true;
                    }
                    return false;
                });
                token = token[0].token;
                delete classes[i].tokenOfUser;
            }catch(err){
                console.log((err.message).red);
            }
            testhelpers.post(gbl_auth_service_url + 'org/' + org + '/classes',
                classes[i],
                {
                    "Authorization" : token
                },
                function (err, res) {
                    if (err) {
                        console.log(err);
                        console.log("Error while creating class".red);
                        console.log((" For class: " + classes[i].title).red);
                    } else {
                        try{
                            classes[i].id = res.body.uuid;
                            console.log(("Successfully created class: " + classes[i].title).green);
                        }catch(err){
                            console.log((err.message).red);
                        }
                    }
                    if(++counter < classes.length){
                        createClassesLoop(counter ,createClassesLoopCallback);
                    }
                    else {
                        createClassesLoopCallback();
                    }
                });
        }(counter);
    };

    createClassesLoop( 0 , function(){
        callback();
    });

}

function classProductAssociation(callback){
    var orgid = config_data.admin.orgid;
    var classproduct = config_data.class_product;
    var createCPAssociationLoop = function(counter, createCPAssociationLoopCallback){
        return function(i){
            let class_title = classproduct[i].class_title;
            let product_name = classproduct[i].product_name;
            if(!products[product_name].hasOwnProperty('classes'))
                products[product_name].classes = [];
            var cid = '';
            for(let z = 0; z < config_data.classes.length; z++) {
                if(config_data.classes[z].title == class_title) {
                    cid = config_data.classes[z].id;
                    break;
                }
            }
            let prodct = config_data.products.filter(function(product) {
                if(product.name == product_name) {
                    return true;
                }
            });
            let productid = prodct[0].id;
            testhelpers.post(gbl_auth_service_url + 'org/' + orgid + '/classes/' + cid + '/associate-product/' + productid + '?branch=true',{},
                {
                    "Authorization" : config_data.admin.token
                },
                function (err, res) {
                    if(err) {
                        console.log(err);
                        console.log(("Error while class product association").red);
                    }
                    else {
                        try{
                            products[product_name].classes.push(cid);
                            console.log(`Class-Product Association Done Classid : ${cid}, productid : ${productid}`);
                        }catch(err){
                            console.log((err.message).red);
                        }
                    }
                    if(++counter < classproduct.length){
                        createCPAssociationLoop(counter ,createCPAssociationLoopCallback);
                    }
                    else {
                        createCPAssociationLoopCallback();
                    }
                });
        }(counter);
    };

    createCPAssociationLoop( 0 , function(){
        callback();
    });

}

function createAssignment(callback){
    var org = config_data.admin.orgid;
    var assignments = config_data.assignment;
    var createAssignmentLoop = function(counter, createAssignmentLoopCallback){
        return function(i){
            let class_title, clsid;
            try{
                class_title = assignments[i].class_title;
                let classes = config_data.classes;
                clsid = '';
                for(let z = 0; z < classes.length; z++) {
                    if(classes[z].title == class_title) {
                        clsid = classes[z].id;
                        break;
                    }
                }
                delete assignments[i].class_title;
            }catch(err){
                console.log((err.message).red);
            }

            let url = gbl_auth_service_url + 'org/' + org + '/classes/' + clsid + '/assignments';
            testhelpers.post(url,assignments[i],
                {
                    "Authorization" : config_data.admin.token
                }, function(err, res) {
                    if (err) {
                        console.log(err);
                        console.log("Error while creating assignment".red);
                    }
                    else {
                        try{
                            assignments[i].class_title = class_title;
                            console.log(("Successfully created assignment").green);
                        }catch(err){
                            console.log((err.message).red);
                        }
                    }
                    if(++counter < assignments.length){
                        createAssignmentLoop(counter ,createAssignmentLoopCallback);
                    }
                    else {
                        createAssignmentLoopCallback();
                    }
                });
        }(counter);
    };

    createAssignmentLoop( 0 , function(){
        callback();
    });

}

function getClassDetail(callback){
    var org = config_data.admin.orgid;
    var assignments = config_data.assignment;
    var getAssignmentLoop = function(counter, getAssignmentLoopCallback){
        return function(i){
            let assignment_title = assignments[i].title;
            let class_title = assignments[i].class_title;
            let classes = config_data.classes;
            let classid;
            try{
                classid = classes.filter(function(cls) {
                    if(cls.title == class_title) {
                        return true;
                    }
                    return false;
                });
                classid = classid[0].id;
            }catch(err){
                console.log((err.message).red);
            }

            let url = gbl_auth_service_url + 'org/' + org + '/classes/' + classid + '?metrics=true';
            testhelpers.get(url, {}, {
                "Authorization" : config_data.admin.token
            }, function(err, res) {
                if(err) {
                    console.log(err);
                    console.log(("Error while gettting class of users.").red);
                }
                else {
                    try{
                        let assignmentid = res.body.assignments.filter(function(assignment) {
                            if(assignment.title == assignment_title) {
                                return true;
                            }
                            return false;
                        });
                        assignmentid = assignmentid[0].uuid;
                        assignment[assignment_title] = assignmentid;
                    }catch(err){
                        console.log((err.message).red);
                    }
                }
                if(++counter < assignments.length){
                    getAssignmentLoop(counter ,getAssignmentLoopCallback);
                }
                else {
                    getAssignmentLoopCallback();
                }
            });
        }(counter);
    };

    getAssignmentLoop(0, function(){
        callback();
    });

}

function getProduct(callback) {
    var orgid = config_data.admin.orgid;
    var productsArr = config_data.products;
    var getProductLoop = function(counter, getProductCallback){
        var product = productsArr[counter];
        var product_id =  product["id"];
        var product_name =  product["name"];
        return function(i){
            testhelpers.get(gbl_product_service_url + orgid +'/products/'+product_id + '?details=true' ,
                {} , {"Authorization" : config_data.admin.token},
                function (err , res ) {
                    if (err) {
                        console.log(err);
                        console.log(("Error while getting product details.").red);
                    } else {
                        try{
                            products[product_name].groupid = res.body.meta.group;
                            if(product.hasOwnProperty("versionid"))
                                products[product_name].versionid = res.body.metadata.path.split('/')[2];
                            console.log(("Successfully get product details: ").green);
                        }catch(err){
                            console.log((err.message).red);
                        }
                    }

                    if(++counter < productsArr.length){
                        getProductLoop(counter ,getProductCallback);
                    }
                    else {
                        getProductCallback();
                    }
                });
        }(counter);
    };

    getProductLoop( 0 , function(){
        callback();
    });


}

function writeDataToJSONFile(jsonFilePath){
    var fs = require('fs');
    fs.writeFile(jsonFilePath , JSON.stringify(output) , null, "\t");
}

authenticateAdmin(function(){
    updateOrgSettings(function(){
        setupUsers(function(){
            setTimeout(function() {
                registerProducts(function(){
                    ingestProducts(function(){
                        console.log("********** intermediate result **************");
                        console.log(JSON.stringify(products));
                        console.log("************************");
                        setTimeout(function(){
                            authenticateTeachers(function(){
                                console.log("********* user detail ***************");
                                console.log(JSON.stringify(users));
                                console.log("************************");
                                createClasses(function(){
                                    setTimeout(function() {
                                        classProductAssociation(function() {
                                            getProduct(function() {
                                                console.log("********** product detail **************");
                                                console.log(JSON.stringify(products));
                                                console.log("************************");
                                                createAssignment(function(){
                                                    setTimeout(function(){
                                                        getClassDetail(function(){
                                                            output.products=products;
                                                            output.users = users;
                                                            output.assignment = assignment;
                                                            console.log("*********** Final output *************");
                                                            console.log(JSON.stringify(output));
                                                            console.log("************************");
                                                            writeDataToJSONFile(filePath);
                                                        });
                                                    },10000);
                                                });
                                            });
                                        });
                                    }, 7000);
                                });
                            });
                        },180000);
                    });
                });
            }, 7000);
        });
    });
});
