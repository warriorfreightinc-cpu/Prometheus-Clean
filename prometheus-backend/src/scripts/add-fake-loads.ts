
// // import { NestFactory } from "@nestjs/core";
// // import * as mongoose from "mongoose";
// // import { AppController } from "src/app.controller";
// // import { AppModule } from "src/app.module";
// // import { PostBrokerService } from "src/post-broker/post.service";
// // import { PostBrokerSchema } from "src/post-broker/schema/post.schema";
// // import * as cities from './data/cities.json';


// // async function bootstrap(){
// //     // const url = process.env.MONGO_URI
// //     // mongoose.connect(url, {}).then(
// //     //     async () => {
// //     //         //console.log("Connected")

// //     //     },
// //     //     err => { console.log(err) }
// //     // );
   
// //     const userId = '63289521324bc915a06faad8'
// //     const companyId = '63207bdb53ffac757b750563';
// //         const application = await NestFactory.createApplicationContext(AppModule);
// //         let newPost = generatePost();
// //         const sendRequests = application.get(AppController);
// //     //    let test =  await sendRequests.sendData(newPost,userId,companyId)
// //     //    test.subscribe(res => {
// //     //     //console.log(res);
// //     //    })
// //     //    //console.log(test);
// //     //const loadService = application.get(PostBrokerService);
   
// //      setInterval( ()=>{
// //          let newPost = generatePost();
// //          let test =  sendRequests.sendData(newPost,userId,companyId)
// //        test.subscribe(res => {
// //         ////console.log(res);
// //        })
// //      },1000)
// // }





// const cityList = (cities as any).cities;
// const capacity = ['full','both','partial'];
// const equipment = ['V','R','F','C','S','P']
// const getRandom = (min, max) => {
//     return Math.floor(Math.random() * (max - min) + min)
// }
// const getRandomCapacity = () => {
//     //return capacity[getRandom(0,3)]
//     return capacity[0]
// }
// const getRandomEquipment = () => {
//     //return equipment[getRandom(0,6)]
//     return equipment[0]
// }
// const getDistanceFromLatLon=(lat1, lon1, lat2, lon2, unit="") => {
//     if (lat1 == lat2 && lon1 == lon2) {
//         return 0;
//     } else {
//         var radlat1 = (Math.PI * lat1) / 180;
//         var radlat2 = (Math.PI * lat2) / 180;
//         var theta = lon1 - lon2;
//         var radtheta = (Math.PI * theta) / 180;
//         var dist =
//             Math.sin(radlat1) * Math.sin(radlat2) +
//             Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
//         if (dist > 1) {
//             dist = 1;
//         }
//         dist = Math.acos(dist);
//         dist = (dist * 180) / Math.PI;
//         dist = dist * 60 * 1.1515;
//         if (unit == 'K') {
//             dist = dist * 1.609344;
//         }
//         if (unit == 'N') {
//             dist = dist * 0.8684;
//         }
//         return Math.round(dist);
//     }
// }

// const getRandomPlace = () => {
//     let city = cityList[getRandom(0, count)]
//     //let city = cityList[2]
//     return {
//         "place": {
//             "city": city.city,
//             "state": city.state_id,
//             "country": "USA"
//         },
//         "type": "place",
//         "location": {
//             "type": "Point",
//             "coordinates": {
//                 "lng": Number(city.lng),
//                 "lat": Number(city.lat)
//             }
//         }
//     }
// }

// const generatePost=()=>{
//     let origin=getRandomPlace();
//     let destination=getRandomPlace();
//     return {
//         "publisherId": "633154aa929f6c29c05aa287",
//         "companyId": "632aa522eb801543b7769480",
//         "length": getRandom(30,53),
//         "weight": getRandom(100,500),
//         "equipment": "V",//getRandomEquipment(),
//         "capacity": "full",//getRandomCapacity(),
//         "company": "Ignat's company",
//         "origin": origin,
//         'refNum':'daa',
//         'comment':'',
//         "destination": destination,
//         "contact":'local-demo@example.com',
//         "distance": getDistanceFromLatLon(
//             origin.location.coordinates.lat,
//             origin.location.coordinates.lng,
//             destination.location.coordinates.lat,
//             destination.location.coordinates.lat),
//         "publishedAt": new Date(),
//         "rate": getRandom(500,12000),
//         "dhoRadius": 150,
//         "dhdRadius": 150,
//         "tankerEndorsement":false,
//         "stops": [
//             {
//                 "type": "pickUp",
//                 "place": {
//                     "place": {
//                         "city": origin.place.city,
//                         "state": origin.place.state,
//                         "country": "USA"
//                     },
//                     "location": {
//                         "type": "Point",
//                         "coordinates": {
//                             "lng": origin.location.coordinates.lng,
//                             "lat": origin.location.coordinates.lat
//                         }
//                     }
//                 },
//                 "date": new Date(),
//                 "comment": null,
//             },
//             {
//                 "type": "delivery",
//                 "place": {
//                     "place": {
//                         "city": destination.place.city,
//                         "state": destination.place.state,
//                         "country": "USA"
//                     },
//                     "location": {
//                         "type": "Point",
//                         "coordinates": {
//                             "lng": destination.location.coordinates.lng,
//                             "lat": destination.location.coordinates.lat
//                         }
//                     }
//                 },
//                 "date": new Date(),
//                 "comment": "dummy"
//             }]
//     }
// }





// let count = cityList.length - 1




//  bootstrap();
