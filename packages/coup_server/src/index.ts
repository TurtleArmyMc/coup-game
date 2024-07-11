import { COUP_TEST_STR } from "coup_shared";
import express from 'express';

const app = express()
const port = 3000

app.get('/', (req: any, res: any) => {
    res.send(COUP_TEST_STR)
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
