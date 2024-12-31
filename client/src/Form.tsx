import { FormEvent, useState } from "react"
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Input from "./components/Input";
import Button from "./components/Button";

const Form = ({
    isSignInPage = true,
}) => {
    const [data, setData] = useState({
        ...(!isSignInPage && {
            fullName: ''
        }),
        email: '',
        password: ''
    })

    const navigate = useNavigate();

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if(!isSignInPage){
          try {
            await axios.post('http://localhost:5000/register', { email: data.email, password: data.password, userName: data.fullName })
            navigate('/sign_in');
          }
          catch (e) {
            console.log(e);
          }
        }
        else {
          try {
            const val = await axios.post('http://localhost:5000/login', { email: data.email, password: data.password })
            localStorage.setItem('user:token', val.data.token);
            localStorage.setItem('user:data', JSON.stringify(val.data.user));
            navigate('/');
          }
          catch (e) {
            console.log(e);
          }
        }
    }

  return (
    <div className="bg-white w-[600px] h-[800px] shadow-lg rounded-lg flex flex-col justify-center items-center">
      <div className="text-4xl font-extrabold">Welcome {isSignInPage && 'Back'}</div>
      <div className="text-xl font-light mb-14">{isSignInPage ? 'Sign in to get explored' : 'Sign up to get started'}</div>
      <form className="flex flex-col items-center w-full" onSubmit={(e) => handleSubmit(e)}>
        { !isSignInPage && <Input label="Full Name" name="name" placeholder="Please enter your full name" className="w-1/2 mb-6" value={data.fullName} onChange={(e) => setData({ ...data, fullName: e.target.value })} type="text" inputClassName="" isRequired={false} /> }
        <Input label="Email" type="email" name="email" placeholder="Please enter your email address" className="w-1/2 mb-6" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} inputClassName="" isRequired={false} />
        <Input label="Password" name="password" placeholder="Please enter your Password" className="w-1/2 mb-14" type="password" value={data.password} onChange={(e) => setData({ ...data, password: e.target.value })} inputClassName="" isRequired={false} />
        <Button className="w-1/2" type="submit" label={isSignInPage ? 'Sign in' : 'Sign up'} disabled={false} />
      </form>
      <div className="pt-2">{ isSignInPage ? "Don't have an account?" : "Alredy have an account?"} <span className=" text-primary cursor-pointer underline" onClick={() => navigate(`${isSignInPage ? '/sign_up' : '/sign_in'}`)}>{ isSignInPage ? 'Sign up' : 'Sign in'}</span></div>
    </div>
  )
}

export default Form