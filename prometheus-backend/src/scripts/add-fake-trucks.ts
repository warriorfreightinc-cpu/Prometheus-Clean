
// import { NestFactory } from "@nestjs/core";
// import { getOptionsToken } from "@nestjs/throttler";
// import * as mongoose from "mongoose";
// import { AppController } from "src/app.controller";
// import { AppModule } from "src/app.module";
// import { PostCarrierSchema } from "src/post-carrier/schema/post.schema";
// import * as cities from './data/cities.json';




// const url = process.env.MONGO_URI

// const cityList = (cities as any).cities;
// const capacity = ['full','both','partial'];
// const equipment = ['V','R','F','C','S','P']
// const getRandom = (min, max) => {
//     return Math.floor(Math.random() * (max - min) + min)
// }
// const getRandomCapacity = () => {
//     return capacity[getRandom(0,3)]
// }
// const getRandomEquipment = () => {
//     return equipment[getRandom(0,6)]
// }

// const getRandomOrigin = () => {
//     let city = cityList[getRandom(0, count)]
//     return getPointStateOrZone(city,'origin')
// }

// const getRandomDestination = () => {
//     let city = cityList[getRandom(0, count)]
//     return getPointStateOrZone(city,'destination')
// }

// const getPointStateOrZone = (city,placeType) => {
//     let point = {"place": {
//         "city": city.city,
//         "state": city.state_id,
//         "country": "USA"
//     },
//     "type": "place",
//     "location": {
//         "type": "Point",
//         "coordinates": {
//             "lng": Number(city.lng),
//             "lat": Number(city.lat)
//         }
//     }}

//     let state = {
//     "type": "states",
//     "states": [city.state_id]
// }
//     let types = [point,state]
//     if(placeType === 'origin'){
//         return types[0]
//     }else{

//         return types[getRandom(0,2)]
//     }

// }

// const generatePost = () => {
//     return {
//         "publisherId": "631b392003f6e2f2cb3f5fd1",
//         "companyId": "632aa522eb801543b7769480",
//         "contact": "12 12 12121212",
//         "length": getRandom(12, 53),
//         "weight": getRandom(20000, 40000),
//         "equipment": getRandomEquipment(),
//         "capacity": getRandomCapacity(),
//         "startDate": new Date(),
//         "endDate": new Date(),
//         "company": "First Company",
//         "origin": getRandomOrigin(),
//         "distance": null,
//         "publishedAt": new Date(),
//         "destination": getRandomDestination(),
//         "comment":"dummy"
//     }
// }





// let count = cityList.length - 1


// mongoose.connect(url, {}).then(
//     async () => {
//         //console.log("Connected")

//         let PostModel = mongoose.model<any>('carrierPost', PostCarrierSchema);

//         let posts = []
//         for (let i = 0; i < 2000; i++) {
//             posts.push(generatePost())
//         }
//         await PostModel.insertMany(posts)
//         //console.log(posts.length + " dummy carrier posts created")
//     },
//     err => { console.log(err) }
// );

// async function bootstrap(){
//     // const url = process.env.MONGO_URI
//     // mongoose.connect(url, {}).then(
//     //     async () => {
//     //         //console.log("Connected")

//     //     },
//     //     err => { console.log(err) }
//     // );
   
//     const userId = '63289521324bc915a06faad8'
//     const companyId = '63207bdb53ffac757b750563';
//         const application = await NestFactory.createApplicationContext(AppModule);
//         let newPost = generatePost();
//         const sendRequests = application.get(AppController);
//     //    let test =  await sendRequests.sendData(newPost,userId,companyId)
//     //    test.subscribe(res => {
//     //     //console.log(res);
//     //    })
//     //    //console.log(test);
//     //const loadService = application.get(PostBrokerService);
   
//      setInterval( ()=>{
//          let newPost = generatePost();
//          let test =  sendRequests.sendData(newPost,userId,companyId)
//        test.subscribe(res => {
//         //console.log(res);
//        })
//      },10000)
// }

// bootstrap();
