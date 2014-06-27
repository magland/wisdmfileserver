var	url=require('url');
var http=require('http');
var wisdmconfig=require('./wisdmconfig').wisdmconfig;	
var fs=require('fs');
var crypto=require('crypto');
var DATABASE=require('./databasemanager').DATABASE;

try {
	//create the data_path directory if doesn't already exist
	fs.mkdirSync(wisdmconfig.wisdmfileserver.data_path);
	fs.mkdirSync(wisdmconfig.wisdmfileserver.data_path+'/data');
	fs.mkdirSync(wisdmconfig.wisdmfileserver.data_path+'/files');
}
catch(err) {
}

http.createServer(function (REQ, RESP) {
	console.log ('REQUEST: '+REQ.url);
	
	var data_path=wisdmconfig.wisdmfileserver.data_path;
	var url_parts = url.parse(REQ.url,true);
	
	if (REQ.method == 'OPTIONS') {
		var headers = {};
		
		//allow cross-domain requests
		
		// IE8 does not allow domains to be specified, just the *
		// headers["Access-Control-Allow-Origin"] = req.headers.origin;
		headers["Access-Control-Allow-Origin"] = "*";
		headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
		headers["Access-Control-Allow-Credentials"] = false;
		headers["Access-Control-Max-Age"] = '86400'; // 24 hours
		headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept";
		RESP.writeHead(200, headers);
		RESP.end();
	}
	else if(REQ.method=='GET') {
		if (url_parts.pathname=='/wisdmfileserver/getFolderData') {
			var fsname=url_parts.query.fsname||'';
			var path=url_parts.query.path||'';
			var file_types=url_parts.query.file_types||'[]';
			try {
				file_types=JSON.parse(file_types);
			}
			catch(err) {
				send_json_response('Error parsing file types.');
				return;
			}
			get_folder_data(fsname,path,file_types,function(resp) {
				send_json_response(resp);
			});
		}
		else if (url_parts.pathname=='/wisdmfileserver/getFileChecksum') {
			var fsname=url_parts.query.fsname||'';
			var path=url_parts.query.path||'';
			get_file_checksum(wisdmconfig.wisdmfileserver.data_path+'/files/'+fsname+'/'+path,function(checksum) {
				send_text_response(checksum);
			});
		}
		else if ((url_parts.pathname=='/wisdmfileserver/getFileText')||(url_parts.pathname=='/wisdmfileserver/getFileData')) {
			var checksum=url_parts.query.checksum||'';
			
			if (url_parts.pathname=='/wisdmfileserver/getFileText')
				RESP.writeHead(200, {"Access-Control-Allow-Origin":"*", "Content-Type":"text/plain"});
			else
				RESP.writeHead(200, {"Access-Control-Allow-Origin":"*", "Content-Type":"application/octet-stream"});
			
			var path=wisdmconfig.wisdmfileserver.data_path+'/data/'+checksum+'.dat';
		
			if (!file_exists(path)) {
				RESP.end();
				return;
			}
			var stream=fs.createReadStream(path);
			stream.on('data',function(d) {
				RESP.write(d);
			});
			stream.on('end',function() {
				RESP.end();
			});
		}
		else {
			send_json_response({success:false,error:'Unrecognized url path.'});
		}
	}
	else if(REQ.method=='POST') {
		//upload a file!
		
		if (url_parts.pathname=='/wisdmfileserver/setFileData') {
			var fsname=url_parts.query.fsname||'';
			var path=url_parts.query.path||'';
			var text=url_parts.query.text||'';
			
			if (!create_path_for_file(path,wisdmconfig.wisdmfileserver.data_path+'/files/'+fsname)) {
				send_json({success:false,error:'Unable to create folder for file.'});
				return;
			}
			
			var path0=wisdmconfig.wisdmfileserver.data_path+'/files/'+fsname+'/'+path;
			//write to a temporary file (later we'll move it over)
			var tmppath0=path0+'.'+make_random_id(4)+'.tmp';
			
			var file_size=REQ.headers['content-length'];
			if (file_size>10*1000*1000) {
				send_json_response({success:false,error:'File is too large: '+file_size});
				return;
			}
			
			var out_stream=fs.createWriteStream(tmppath0);
			
			var byte_count=0;
			
			var done=false;
			REQ.on('data',function(d) {
				if (done) return;
				out_stream.write(d);
				byte_count+=d.length;
			});
			REQ.on('end',function() {
				if (done) return;
				if (byte_count!=file_size) {
					send_json_response({success:false,error:'Unexpected file size: '+byte_count+' <> '+file_size});
					done=true;
					return;
				}
				if (file_exists(path0)) {
					remove_file(path0);
				}
				if (!rename_file(tmppath0,path0)) {
					send_json_response({success:false,error:'Problem renaming file'});
					done=true;
					return;
				}
				send_json_response({success:true});
				done=true;
			});
		}
		else {
			send_json_response({success:false,error:'Unexpected path for POST: '+url_parts.pathname});
		}
	}
	
	function create_path_for_file(relpath,basepath) {
		if (!basepath) basepath=m_data_path;
		var ind=relpath.indexOf('/');
		if (ind<0) return true;
		var str1=relpath.slice(0,ind);
		var str2=relpath.slice(ind+1);
		var path1=basepath+'/'+str1;
		if (!make_dir_if_needed(path1)) return false;
		return create_path_for_file(str2,path1);
	}
	function make_dir_if_needed(path) {
		if (is_directory(path)) return true;
		fs.mkdirSync(path);
		if (is_directory(path)) return true;
		return false;
	}
	function rename_file(path1,path2) {
		if (!file_exists(path1)) return false;
		if (file_exists(path2)) return false;
		try {
			fs.renameSync(path1,path2);
			return true;
		}
		catch(err) {
			return false;
		}
	}
	function is_directory(path) {
		if (!fs.existsSync(path)) return false;
		stats=fs.statSync(path);
		return stats.isDirectory();
	}
	
	function remove_file(path) {
		try {
			fs.unlinkSync(path);
		}
		catch(err) {
		}
	}
	
	function get_folder_data(fsname,path,file_types,callback) {
		var ret={files:[],dirs:[]};
		var path1=wisdmconfig.wisdmfileserver.data_path+'/files/'+fsname+'/'+path;
		var list;
		try {
			list=fs.readdirSync(path1);
		}
		catch(err) {
			callback(ret);
			return;
		}
		for_each_async(list,function(file0,cb) {
			var path2=path1+'/'+file0;
			if (fs.statSync(path2).isDirectory()) {
				get_folder_data(fsname,append_paths(path,file0),file_types,function(ret2) {
					ret.dirs.push({name:file0,content:ret2});
					cb({success:true});
				});
			}
			else {
				if (is_valid_file_type(get_file_suffix(path2),file_types)) {
					get_file_checksum(path2,function(checksum) {
						if (checksum) {
							var data_path=wisdmconfig.wisdmfileserver.data_path+'/data/'+checksum+'.dat';
							if (!file_exists(data_path)) {
								fs.linkSync(path2,data_path);
							}
						}
						ret.files.push({name:file0,checksum:checksum});
						cb({success:true});
					});
				}
				else cb({success:true});
			}
		},function() {
			callback(ret);
		});
	}
	function get_file_suffix(str) {
		if (!str) return '';
		var ind=str.lastIndexOf('.');
		if (ind>=0) return str.substr(ind+1);
		else return '';
	}
	function is_valid_file_type(type0,types) {
		if (types.length===0) return true;
		return (types.indexOf(type0)>=0);
	}
	
	function get_file_checksum(path,callback) {
		if (!file_exists(path)) {
			console.error('Unexpected problem in get_file_checksum, file does not exist.');
			callback('');
			return;
		}
		var stats=fs.statSync(path);
		
		var DB=DATABASE('filesystem');
		DB.setCollection('checksums');
		DB.find({_id:path},{checksum:1,mtime:1,size:1},function(err,docs) {
			if (err) {
				console.error('Unexpected problem in get_file_checksum, database error: '+err.message);
				callback('');
				return;
			}
			var doc=docs[0];
			if (doc) {
				if ((doc.mtime==stats.mtime)&&(doc.size==stats.size)) {
					callback(doc.checksum);
					return;
				}
			}
			compute_file_checksum(path,function(checksum) {
				if (checksum) {
					DB.save({_id:path,checksum:checksum,mtime:stats.mtime,size:stats.size},function(err) {
						if (err) {
							console.error('Unexpected problem saving checksum to database');
						}
						callback(checksum);
					});
				}
				else {
					console.error('Unexpected problem in get_file_checksum, computed checksum is empty.');
					callback('');
					return;
				}
			});
		});
	}
	function compute_file_checksum(path,callback) {
		var hash=require('crypto').createHash('sha1');
		var stream=fs.createReadStream(path);
		stream.on('data',function(d) {hash.update(d);});
		stream.on('end',function() {callback(hash.digest('hex'));});
		stream.on('error',function(err) {console.error(err.message); callback('');});
	}
	
	function for_each_async(list,func,callback,max_simultaneous) {
		if (!max_simultaneous) max_simultaneous=1;
		var ind=0;
		var num_running=0;
		var did_callback=false;
		do_next();
		function do_next() {
			if (ind==list.length) {
				if (!did_callback) {
					did_callback=true;
					callback({success:true});
					return;
				}
			}
			if (num_running>=max_simultaneous) return;
			ind++;
			num_running++;
			func(list[ind-1],function(tmp) {
				num_running--;
				if (tmp.success) do_next();
				else {
					if (!did_callback) {
						callback(tmp); did_callback=true;
					}
				}
			});
		}
	};
	function append_paths(path1,path2) {
		if (!path1) return path2;
		if (!path2) return path1;
		return path1+'/'+path2;
	}
	function make_random_id(numchars) {
		if (!numchars) numchars=10;
		var text = "";
		var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for( var i=0; i < numchars; i++ ) text += possible.charAt(Math.floor(Math.random() * possible.length));	
		return text;
	}
	
	function send_json_response(obj) {
		RESP.writeHead(200, {"Access-Control-Allow-Origin":"*", "Content-Type":"application/json"});
		RESP.end(JSON.stringify(obj));
	}
	function send_text_response(text) {
		RESP.writeHead(200, {"Access-Control-Allow-Origin":"*", "Content-Type":"text/plain"});
		RESP.end(text);
	}
	
	function file_exists(path) {
		return fs.existsSync(path);
	}
	
}).listen(wisdmconfig.wisdmfileserver.listen_port);
console.log ('Listening on port '+wisdmconfig.wisdmfileserver.listen_port);

